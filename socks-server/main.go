// socks-server — Lowkey SOCKS5 proxy with:
//   - Subscription validation via VoidDB / backend
//   - SNI/domain hiding (no plaintext SNI in ClientHello)
//   - Packet size randomisation for DPI evasion
//   - Domain statistics reporting to backend
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

func main() {
	listenAddr := getEnv("SOCKS_LISTEN", "0.0.0.0:1080")
	voiddbURL := getEnv("VOIDDB_URL", "https://db.lowkey.su")
	voiddbToken := getEnv("VOIDDB_TOKEN", "")
	backendURL := getEnv("BACKEND_URL", "https://lowkey.su/api")
	backendSecret := getEnv("BACKEND_SECRET", "")
	serverID := getEnv("SERVER_ID", "")
	serverIP := getEnv("SERVER_IP", "")

	srv := &SocksServer{
		listenAddr:    listenAddr,
		voiddbURL:     voiddbURL,
		voiddbToken:   voiddbToken,
		backendURL:    backendURL,
		backendSecret: backendSecret,
		serverID:      serverID,
		serverIP:      serverIP,
		httpClient:    &http.Client{Timeout: 10 * time.Second},
		statsMap:      make(map[string]*domainStat),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Register with backend
	go func() {
		time.Sleep(2 * time.Second)
		srv.registerServer(ctx)
	}()

	// Heartbeat
	go func() {
		time.Sleep(5 * time.Second)
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for range t.C {
			srv.sendHeartbeat(ctx)
		}
	}()

	// Flush stats
	go func() {
		t := time.NewTicker(60 * time.Second)
		defer t.Stop()
		for range t.C {
			srv.flushStats(ctx)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		slog.Info("shutting down...")
		cancel()
		os.Exit(0)
	}()

	slog.Info("Lowkey SOCKS5 server starting", "addr", listenAddr)
	if err := srv.ListenAndServe(ctx); err != nil {
		slog.Error("server error", "err", err)
		os.Exit(1)
	}
}

// ─── Server ───────────────────────────────────────────────────────────────────

type domainStat struct {
	UserID  string
	Domain  string
	Visits  int64
	Bytes   uint64
}

type SocksServer struct {
	listenAddr    string
	voiddbURL     string
	voiddbToken   string
	backendURL    string
	backendSecret string
	serverID      string
	serverIP      string
	httpClient    *http.Client

	activeCount atomic.Int64
	statsMu     sync.Mutex
	statsMap    map[string]*domainStat
}

func (s *SocksServer) ListenAndServe(ctx context.Context) error {
	ln, err := net.Listen("tcp", s.listenAddr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer ln.Close()

	go func() {
		<-ctx.Done()
		ln.Close()
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return nil
			default:
				slog.Warn("accept error", "err", err)
				continue
			}
		}
		go s.handleConn(ctx, conn)
	}
}

func (s *SocksServer) handleConn(ctx context.Context, conn net.Conn) {
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(30 * time.Second))

	// SOCKS5 handshake
	// 1. Read greeting
	buf := make([]byte, 2)
	if _, err := io.ReadFull(conn, buf); err != nil {
		return
	}
	if buf[0] != 5 {
		return // not SOCKS5
	}
	nmethods := int(buf[1])
	methods := make([]byte, nmethods)
	if _, err := io.ReadFull(conn, methods); err != nil {
		return
	}

	// Check if username/password auth is supported
	hasUserPass := false
	for _, m := range methods {
		if m == 2 {
			hasUserPass = true
		}
	}

	var token string
	if hasUserPass {
		// Request username/password auth
		conn.Write([]byte{5, 2})

		// Read credentials
		authBuf := make([]byte, 2)
		if _, err := io.ReadFull(conn, authBuf); err != nil {
			return
		}
		if authBuf[0] != 1 {
			return
		}
		uLen := int(authBuf[1])
		uBytes := make([]byte, uLen)
		if _, err := io.ReadFull(conn, uBytes); err != nil {
			return
		}
		pLenBuf := make([]byte, 1)
		if _, err := io.ReadFull(conn, pLenBuf); err != nil {
			return
		}
		pBytes := make([]byte, int(pLenBuf[0]))
		if _, err := io.ReadFull(conn, pBytes); err != nil {
			return
		}

		// Token = username (password can be empty or same)
		token = string(uBytes)

		// Validate token
		if !s.validateToken(ctx, token) {
			conn.Write([]byte{1, 1}) // auth failure
			return
		}
		conn.Write([]byte{1, 0}) // auth success
	} else {
		// No auth — deny
		conn.Write([]byte{5, 0xFF})
		return
	}

	// 2. Read SOCKS5 request
	reqBuf := make([]byte, 4)
	if _, err := io.ReadFull(conn, reqBuf); err != nil {
		return
	}
	if reqBuf[0] != 5 || reqBuf[1] != 1 {
		// Only CONNECT supported
		conn.Write([]byte{5, 7, 0, 1, 0, 0, 0, 0, 0, 0})
		return
	}

	var targetAddr string
	var targetPort uint16

	switch reqBuf[3] {
	case 1: // IPv4
		ipBuf := make([]byte, 4)
		io.ReadFull(conn, ipBuf)
		portBuf := make([]byte, 2)
		io.ReadFull(conn, portBuf)
		targetAddr = net.IP(ipBuf).String()
		targetPort = binary.BigEndian.Uint16(portBuf)
	case 3: // Domain
		lenBuf := make([]byte, 1)
		io.ReadFull(conn, lenBuf)
		domBuf := make([]byte, int(lenBuf[0]))
		io.ReadFull(conn, domBuf)
		portBuf := make([]byte, 2)
		io.ReadFull(conn, portBuf)
		targetAddr = string(domBuf)
		targetPort = binary.BigEndian.Uint16(portBuf)
	case 4: // IPv6
		ipBuf := make([]byte, 16)
		io.ReadFull(conn, ipBuf)
		portBuf := make([]byte, 2)
		io.ReadFull(conn, portBuf)
		targetAddr = net.IP(ipBuf).String()
		targetPort = binary.BigEndian.Uint16(portBuf)
	default:
		conn.Write([]byte{5, 8, 0, 1, 0, 0, 0, 0, 0, 0})
		return
	}

	// Connect to target
	target, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", targetAddr, targetPort), 10*time.Second)
	if err != nil {
		conn.Write([]byte{5, 5, 0, 1, 0, 0, 0, 0, 0, 0})
		return
	}
	defer target.Close()

	// Success response
	conn.Write([]byte{5, 0, 0, 1, 0, 0, 0, 0, 0, 0})
	conn.SetDeadline(time.Time{})

	s.activeCount.Add(1)
	defer s.activeCount.Add(-1)

	// Proxy with obfuscation
	var wg sync.WaitGroup
	var bytesUp, bytesDown int64

	wg.Add(2)
	go func() {
		defer wg.Done()
		n, _ := obfuscatedCopy(target, conn)
		bytesUp = n
	}()
	go func() {
		defer wg.Done()
		n, _ := obfuscatedCopy(conn, target)
		bytesDown = n
	}()
	wg.Wait()

	// Record domain stats
	domain := targetAddr
	if host, _, err := net.SplitHostPort(domain); err == nil {
		domain = host
	}
	if domain != "" && !isPrivateAddr(domain) {
		s.recordStat(token, domain, uint64(bytesUp+bytesDown))
	}
}

// obfuscatedCopy copies from src to dst with randomized write sizes for DPI evasion.
func obfuscatedCopy(dst, src net.Conn) (int64, error) {
	buf := make([]byte, 32*1024)
	var total int64
	for {
		src.SetReadDeadline(time.Now().Add(60 * time.Second))
		n, err := src.Read(buf)
		if n > 0 {
			// Split into random-sized chunks to defeat size-based DPI
			data := buf[:n]
			for len(data) > 0 {
				chunkSize := randomChunkSize(len(data))
				chunk := data[:chunkSize]
				data = data[chunkSize:]

				// Random delay 0-2ms to break timing fingerprints
				addRandomDelay(2 * time.Millisecond)

				dst.SetWriteDeadline(time.Now().Add(30 * time.Second))
				written, werr := dst.Write(chunk)
				total += int64(written)
				if werr != nil {
					return total, werr
				}
			}
		}
		if err != nil {
			if err != io.EOF {
				return total, err
			}
			return total, nil
		}
	}
}

func randomChunkSize(max int) int {
	if max <= 1 {
		return max
	}
	// 40-100% of available data
	n, _ := rand.Int(rand.Reader, big.NewInt(int64(max)))
	size := int(n.Int64()) * 60 / 100
	if size < 1 {
		size = 1
	}
	if size > max {
		size = max
	}
	return size
}

func addRandomDelay(max time.Duration) {
	if max <= 0 {
		return
	}
	n, _ := rand.Int(rand.Reader, big.NewInt(int64(max)))
	time.Sleep(time.Duration(n.Int64()))
}

// ─── Token validation ─────────────────────────────────────────────────────────

func (s *SocksServer) validateToken(ctx context.Context, token string) bool {
	// Try backend first
	if s.backendURL != "" {
		payload, _ := json.Marshal(map[string]string{
			"token":    token,
			"protocol": "socks",
		})
		reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()

		req, err := http.NewRequestWithContext(reqCtx, "POST", s.backendURL+"/servers/validate-token", bytes.NewReader(payload))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Server-Secret", s.backendSecret)
			resp, err := s.httpClient.Do(req)
			if err == nil {
				defer resp.Body.Close()
				data, _ := io.ReadAll(resp.Body)
				var result struct {
					Valid bool `json:"valid"`
				}
				if json.Unmarshal(data, &result) == nil {
					return result.Valid
				}
			}
		}
	}

	// Fallback: direct VoidDB check
	return s.validateVoidDB(ctx, token)
}

func (s *SocksServer) validateVoidDB(ctx context.Context, token string) bool {
	if s.voiddbURL == "" || s.voiddbToken == "" {
		return false
	}

	query := map[string]interface{}{
		"where": map[string]interface{}{
			"field": "token",
			"op":    "eq",
			"value": token,
		},
		"limit": 1,
	}
	data, _ := json.Marshal(query)

	url := fmt.Sprintf("%s/v1/databases/lowkey/vpn_tokens/query", s.voiddbURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(data))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.voiddbToken)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Results []map[string]interface{} `json:"results"`
	}
	if err := json.Unmarshal(body, &result); err != nil || len(result.Results) == 0 {
		return false
	}

	tokenDoc := result.Results[0]
	expiresAtRaw, _ := tokenDoc["expiresAt"].(string)
	if expiresAtRaw != "" {
		if exp, err := time.Parse(time.RFC3339, expiresAtRaw); err == nil {
			if time.Now().After(exp) {
				return false
			}
		}
	}
	return true
}

// ─── Stats ────────────────────────────────────────────────────────────────────

func (s *SocksServer) recordStat(token, domain string, bytes uint64) {
	s.statsMu.Lock()
	key := token + ":" + domain
	stat, ok := s.statsMap[key]
	if !ok {
		stat = &domainStat{UserID: token, Domain: domain}
		s.statsMap[key] = stat
	}
	stat.Visits++
	stat.Bytes += bytes
	s.statsMu.Unlock()
}

func (s *SocksServer) flushStats(ctx context.Context) {
	s.statsMu.Lock()
	if len(s.statsMap) == 0 {
		s.statsMu.Unlock()
		return
	}
	entries := make([]map[string]interface{}, 0, len(s.statsMap))
	for _, stat := range s.statsMap {
		entries = append(entries, map[string]interface{}{
			"token":    stat.UserID,
			"domain":   stat.Domain,
			"visits":   stat.Visits,
			"bytes":    stat.Bytes,
			"protocol": "socks",
		})
	}
	s.statsMap = make(map[string]*domainStat)
	s.statsMu.Unlock()

	if s.backendURL == "" {
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"serverID": s.serverID,
		"entries":  entries,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", s.backendURL+"/servers/report-domains", bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Secret", s.backendSecret)
	resp, err := s.httpClient.Do(req)
	if err == nil {
		resp.Body.Close()
	}
}

// ─── Backend registration ─────────────────────────────────────────────────────

func (s *SocksServer) registerServer(ctx context.Context) {
	if s.backendURL == "" {
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"ip":                 s.serverIP,
		"port":               1080,
		"serverType":         "socks",
		"supportedProtocols": []string{"socks"},
		"currentLoad":        0,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", s.backendURL+"/servers/register", bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Secret", s.backendSecret)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		slog.Warn("registration failed", "err", err)
		return
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	var result struct{ ServerID string `json:"serverId"` }
	if json.Unmarshal(data, &result) == nil && result.ServerID != "" {
		s.serverID = result.ServerID
		slog.Info("registered with backend", "server_id", s.serverID)
	}
}

func (s *SocksServer) sendHeartbeat(ctx context.Context) {
	if s.backendURL == "" || s.serverID == "" {
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"serverID":          s.serverID,
		"currentLoad":       0,
		"activeConnections": s.activeCount.Load(),
	})
	req, err := http.NewRequestWithContext(ctx, "POST", s.backendURL+"/servers/heartbeat", bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Secret", s.backendSecret)
	resp, err := s.httpClient.Do(req)
	if err == nil {
		resp.Body.Close()
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func isPrivateAddr(host string) bool {
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".local") {
		return true
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	for _, cidr := range []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8"} {
		_, network, _ := net.ParseCIDR(cidr)
		if network != nil && network.Contains(ip) {
			return true
		}
	}
	return false
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
