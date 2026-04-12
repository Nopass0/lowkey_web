// pimpam-server — Lowkey PIMPAM VPN protocol server.
//
// PIMPAM is a custom VPN protocol with:
//   - XChaCha20-Poly1305 full encryption
//   - TLS camouflage: traffic looks like HTTPS to a masquerade domain
//   - Subscription validation via VoidDB / backend API
//   - Domain statistics reporting
//   - Per-user traffic rules
package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/binary"
	"encoding/json"
	"encoding/pem"
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

	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/hkdf"
)

// ─── Protocol constants ───────────────────────────────────────────────────────

const (
	ppMagic      = uint32(0x504D504D) // "PMPM"
	ppVersion    = uint8(1)
	ppHandshake  = uint8(0x01)
	ppData       = uint8(0x02)
	ppClose      = uint8(0x03)
	ppPing       = uint8(0x04)
	ppPong       = uint8(0x05)
	ppHeaderSize = 4 + 1 + 1 + 4 // magic(4) + ver(1) + type(1) + len(4)
)

func main() {
	listenAddr := getEnv("PIMPAM_LISTEN", "0.0.0.0:8443")
	certFile := getEnv("TLS_CERT", "")
	keyFile := getEnv("TLS_KEY", "")
	masqDomain := getEnv("MASQ_DOMAIN", "www.cloudflare.com")
	voiddbURL := getEnv("VOIDDB_URL", "https://db.lowkey.su")
	voiddbToken := getEnv("VOIDDB_TOKEN", "")
	backendURL := getEnv("BACKEND_URL", "https://lowkey.su/api")
	backendSecret := getEnv("BACKEND_SECRET", "")
	serverID := getEnv("SERVER_ID", "")
	serverIP := getEnv("SERVER_IP", "")

	srv := &PimpamServer{
		listenAddr:    listenAddr,
		masqDomain:    masqDomain,
		voiddbURL:     voiddbURL,
		voiddbToken:   voiddbToken,
		backendURL:    backendURL,
		backendSecret: backendSecret,
		serverID:      serverID,
		serverIP:      serverIP,
		httpClient:    &http.Client{Timeout: 10 * time.Second},
		statsMap:      make(map[string]*domainStat),
		sessions:      make(map[string]*ppSession),
	}

	// Load TLS
	var tlsConfig *tls.Config
	if certFile != "" && keyFile != "" {
		cert, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err != nil {
			slog.Error("failed to load TLS cert", "err", err)
			os.Exit(1)
		}
		tlsConfig = &tls.Config{
			Certificates: []tls.Certificate{cert},
			MinVersion:   tls.VersionTLS13,
			// Traffic looks like generic HTTPS — no ALPN to avoid fingerprinting
		}
	} else {
		// Self-signed for development
		tlsConfig = generateSelfSigned(masqDomain)
	}
	srv.tlsConfig = tlsConfig

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		time.Sleep(2 * time.Second)
		srv.registerServer(ctx)
	}()
	go func() {
		time.Sleep(5 * time.Second)
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for range t.C {
			srv.sendHeartbeat(ctx)
		}
	}()
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

	slog.Info("PIMPAM server starting", "addr", listenAddr, "masq", masqDomain)
	if err := srv.ListenAndServe(ctx); err != nil {
		slog.Error("server error", "err", err)
		os.Exit(1)
	}
}

// ─── Server ───────────────────────────────────────────────────────────────────

type domainStat struct {
	UserID string
	Domain string
	Visits int64
	Bytes  uint64
}

type ppSession struct {
	id       string
	token    string
	userID   string
	cipher   *ppCipher
	conn     net.Conn
	bytesUp  atomic.Int64
	bytesDown atomic.Int64
	streams  sync.Map // streamID (uint16) -> *ppStream
	lastSeen time.Time
}

type ppStream struct {
	id         uint16
	targetConn net.Conn
	closed     atomic.Bool
}

type PimpamServer struct {
	listenAddr    string
	masqDomain    string
	voiddbURL     string
	voiddbToken   string
	backendURL    string
	backendSecret string
	serverID      string
	serverIP      string
	httpClient    *http.Client
	tlsConfig     *tls.Config

	sessionsMu  sync.RWMutex
	sessions    map[string]*ppSession
	activeCount atomic.Int64

	statsMu  sync.Mutex
	statsMap map[string]*domainStat
}

func (s *PimpamServer) ListenAndServe(ctx context.Context) error {
	ln, err := tls.Listen("tcp", s.listenAddr, s.tlsConfig)
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

func (s *PimpamServer) handleConn(ctx context.Context, conn net.Conn) {
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(30 * time.Second))

	// Read first packet — could be real PIMPAM or a probe (masquerade as cloudflare)
	hdr := make([]byte, ppHeaderSize)
	if _, err := io.ReadFull(conn, hdr); err != nil {
		// Probe — send a fake HTTP/2 response to masquerade
		s.sendMasqResponse(conn)
		return
	}

	magic := binary.BigEndian.Uint32(hdr[0:4])
	if magic != ppMagic {
		// Not PIMPAM — send masquerade response
		s.sendMasqResponse(conn)
		return
	}

	ver := hdr[4]
	pktType := hdr[5]
	pktLen := binary.BigEndian.Uint32(hdr[6:10])

	if ver != ppVersion {
		return
	}

	if pktLen > 1024*1024 {
		return // too large
	}

	payload := make([]byte, pktLen)
	if _, err := io.ReadFull(conn, payload); err != nil {
		return
	}

	if pktType != ppHandshake {
		return
	}

	// Process handshake
	if len(payload) < 32+24+16 {
		return // too short for ECDH + encrypted token
	}

	var clientPub [32]byte
	copy(clientPub[:], payload[:32])

	// Load server private key from env
	serverPriv := s.loadServerPrivKey()
	var shared [32]byte
	curve25519.ScalarMult(&shared, &serverPriv, &clientPub)

	// Derive session cipher
	cipher := newPPCipher(shared)

	// Decrypt handshake payload
	tokenData, err := cipher.Decrypt(payload[32:])
	if err != nil {
		slog.Debug("handshake decrypt failed")
		return
	}

	var handshake struct {
		Token    string `json:"token"`
		DeviceID string `json:"device_id"`
		Platform string `json:"platform"`
	}
	if err := json.Unmarshal(tokenData, &handshake); err != nil {
		return
	}

	// Validate subscription
	if !s.validateToken(ctx, handshake.Token) {
		resp, _ := json.Marshal(map[string]interface{}{
			"status":  "denied",
			"message": "invalid token or subscription expired",
		})
		s.sendPacket(conn, cipher, ppHandshake, resp)
		return
	}

	// Create session
	sessID := generateID()
	sess := &ppSession{
		id:       sessID,
		token:    handshake.Token,
		cipher:   cipher,
		conn:     conn,
		lastSeen: time.Now(),
	}

	s.sessionsMu.Lock()
	s.sessions[sessID] = sess
	s.sessionsMu.Unlock()
	s.activeCount.Add(1)
	defer func() {
		s.sessionsMu.Lock()
		delete(s.sessions, sessID)
		s.sessionsMu.Unlock()
		s.activeCount.Add(-1)
	}()

	// Send session ID back
	resp, _ := json.Marshal(map[string]interface{}{
		"status":     "ok",
		"session_id": sessID,
	})
	if err := s.sendPacket(conn, cipher, ppHandshake, resp); err != nil {
		return
	}

	conn.SetDeadline(time.Time{})
	slog.Info("PIMPAM client connected", "session", sessID, "platform", handshake.Platform)

	// Main session loop
	s.sessionLoop(ctx, sess)
}

func (s *PimpamServer) sessionLoop(ctx context.Context, sess *ppSession) {
	for {
		hdr := make([]byte, ppHeaderSize)
		sess.conn.SetDeadline(time.Now().Add(5 * time.Minute))
		if _, err := io.ReadFull(sess.conn, hdr); err != nil {
			break
		}

		magic := binary.BigEndian.Uint32(hdr[0:4])
		if magic != ppMagic {
			break
		}
		pktType := hdr[5]
		pktLen := binary.BigEndian.Uint32(hdr[6:10])
		if pktLen > 2*1024*1024 {
			break
		}

		payload := make([]byte, pktLen)
		if _, err := io.ReadFull(sess.conn, payload); err != nil {
			break
		}

		plaintext, err := sess.cipher.Decrypt(payload)
		if err != nil {
			slog.Debug("session decrypt failed", "session", sess.id)
			continue
		}

		switch pktType {
		case ppData:
			go s.handleDataPacket(ctx, sess, plaintext)
		case ppClose:
			s.handleClose(sess, plaintext)
		case ppPing:
			pong, _ := sess.cipher.Encrypt([]byte("pong"))
			s.sendRaw(sess.conn, ppPong, pong)
		}
		sess.lastSeen = time.Now()
	}
}

func (s *PimpamServer) handleDataPacket(ctx context.Context, sess *ppSession, data []byte) {
	// Data format: [streamID:2][flags:1][addrLen:2][addr][port:2][payload]
	if len(data) < 7 {
		return
	}
	streamID := binary.BigEndian.Uint16(data[0:2])
	flags := data[2]
	addrLen := binary.BigEndian.Uint16(data[3:5])
	if int(5+addrLen+2) > len(data) {
		return
	}
	addr := string(data[5 : 5+addrLen])
	port := binary.BigEndian.Uint16(data[5+addrLen : 5+addrLen+2])
	payload := data[5+addrLen+2:]

	isNew := flags&0x01 != 0

	if isNew {
		// Open new TCP connection to target
		target, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", addr, port), 10*time.Second)
		if err != nil {
			s.sendClose(sess, streamID, err.Error())
			return
		}

		st := &ppStream{id: streamID, targetConn: target}
		sess.streams.Store(streamID, st)

		// Start reader goroutine
		go s.streamReader(ctx, sess, st, addr, port)

		// Write first payload
		if len(payload) > 0 {
			target.Write(payload)
			sess.bytesUp.Add(int64(len(payload)))
		}

		// Record domain stat
		if !isPrivateAddr(addr) {
			s.recordStat(sess.token, addr, 0)
		}
	} else {
		// Write to existing stream
		if v, ok := sess.streams.Load(streamID); ok {
			st := v.(*ppStream)
			if !st.closed.Load() {
				st.targetConn.Write(payload)
				sess.bytesUp.Add(int64(len(payload)))
			}
		}
	}
}

func (s *PimpamServer) streamReader(ctx context.Context, sess *ppSession, st *ppStream, addr string, port uint16) {
	defer func() {
		st.closed.Store(true)
		st.targetConn.Close()
		sess.streams.Delete(st.id)
		s.sendClose(sess, st.id, "")
	}()

	buf := make([]byte, 32*1024)
	for {
		st.targetConn.SetReadDeadline(time.Now().Add(5 * time.Minute))
		n, err := st.targetConn.Read(buf)
		if n > 0 {
			// Build response packet
			addrBytes := []byte(addr)
			pkt := make([]byte, 7+len(addrBytes)+n)
			binary.BigEndian.PutUint16(pkt[0:2], st.id)
			pkt[2] = 0 // continuation
			binary.BigEndian.PutUint16(pkt[3:5], uint16(len(addrBytes)))
			copy(pkt[5:], addrBytes)
			binary.BigEndian.PutUint16(pkt[5+len(addrBytes):], port)
			copy(pkt[7+len(addrBytes):], buf[:n])

			encrypted, encErr := sess.cipher.Encrypt(pkt)
			if encErr == nil {
				s.sendRaw(sess.conn, ppData, encrypted)
				sess.bytesDown.Add(int64(n))

				if !isPrivateAddr(addr) {
					s.recordStat(sess.token, addr, uint64(n))
				}
			}
		}
		if err != nil {
			return
		}
	}
}

func (s *PimpamServer) handleClose(sess *ppSession, data []byte) {
	if len(data) < 2 {
		return
	}
	streamID := binary.BigEndian.Uint16(data[0:2])
	if v, ok := sess.streams.Load(streamID); ok {
		st := v.(*ppStream)
		st.closed.Store(true)
		st.targetConn.Close()
		sess.streams.Delete(streamID)
	}
}

func (s *PimpamServer) sendClose(sess *ppSession, streamID uint16, reason string) {
	data := make([]byte, 2+len(reason))
	binary.BigEndian.PutUint16(data[0:2], streamID)
	copy(data[2:], reason)
	encrypted, err := sess.cipher.Encrypt(data)
	if err == nil {
		s.sendRaw(sess.conn, ppClose, encrypted)
	}
}

func (s *PimpamServer) sendPacket(conn net.Conn, cipher *ppCipher, pktType uint8, payload []byte) error {
	encrypted, err := cipher.Encrypt(payload)
	if err != nil {
		return err
	}
	return s.sendRaw(conn, pktType, encrypted)
}

func (s *PimpamServer) sendRaw(conn net.Conn, pktType uint8, payload []byte) error {
	hdr := make([]byte, ppHeaderSize)
	binary.BigEndian.PutUint32(hdr[0:4], ppMagic)
	hdr[4] = ppVersion
	hdr[5] = pktType
	binary.BigEndian.PutUint32(hdr[6:10], uint32(len(payload)))
	conn.SetWriteDeadline(time.Now().Add(30 * time.Second))
	if _, err := conn.Write(hdr); err != nil {
		return err
	}
	_, err := conn.Write(payload)
	return err
}

// sendMasqResponse sends a fake HTTPS/cloudflare-like response for probes.
func (s *PimpamServer) sendMasqResponse(conn net.Conn) {
	response := fmt.Sprintf("HTTP/1.1 200 OK\r\nServer: cloudflare\r\nContent-Type: text/html\r\nContent-Length: 0\r\nDate: %s\r\n\r\n",
		time.Now().UTC().Format(http.TimeFormat))
	conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	conn.Write([]byte(response))
}

func (s *PimpamServer) loadServerPrivKey() [32]byte {
	privHex := getEnv("PIMPAM_PRIV", "")
	if privHex == "" {
		// Generate deterministic key from server ID
		h := sha256.Sum256([]byte("pimpam-server-key-" + s.serverID))
		return h
	}
	var key [32]byte
	data := make([]byte, 32)
	fmt.Sscanf(privHex, "%x", &data)
	copy(key[:], data)
	return key
}

// ─── Cipher ───────────────────────────────────────────────────────────────────

type ppCipher struct {
	key [32]byte
	mu  sync.Mutex
	ctr uint64
}

func newPPCipher(sharedSecret [32]byte) *ppCipher {
	// Derive session key via HKDF-SHA256
	reader := hkdf.New(sha256.New, sharedSecret[:], []byte("pimpam-v1"), []byte("session-key"))
	var key [32]byte
	io.ReadFull(reader, key[:])
	return &ppCipher{key: key}
}

func (c *ppCipher) Encrypt(plaintext []byte) ([]byte, error) {
	aead, err := chacha20poly1305.NewX(c.key[:])
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, chacha20poly1305.NonceSizeX)
	rand.Read(nonce)
	return aead.Seal(nonce, nonce, plaintext, nil), nil
}

func (c *ppCipher) Decrypt(data []byte) ([]byte, error) {
	aead, err := chacha20poly1305.NewX(c.key[:])
	if err != nil {
		return nil, err
	}
	if len(data) < chacha20poly1305.NonceSizeX+aead.Overhead() {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce := data[:chacha20poly1305.NonceSizeX]
	ct := data[chacha20poly1305.NonceSizeX:]
	return aead.Open(nil, nonce, ct, nil)
}

// ─── TLS helper ───────────────────────────────────────────────────────────────

func generateSelfSigned(domain string) *tls.Config {
	slog.Warn("No TLS cert configured — generating ephemeral self-signed cert. Set TLS_CERT and TLS_KEY in production.")
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		slog.Error("failed to generate key", "err", err)
		os.Exit(1)
	}
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: domain},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     []string{domain},
	}
	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &priv.PublicKey, priv)
	if err != nil {
		slog.Error("failed to create certificate", "err", err)
		os.Exit(1)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyDER, _ := x509.MarshalECPrivateKey(priv)
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		slog.Error("failed to parse key pair", "err", err)
		os.Exit(1)
	}
	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS13,
	}
}

// ─── Token validation ─────────────────────────────────────────────────────────

func (s *PimpamServer) validateToken(ctx context.Context, token string) bool {
	if s.backendURL != "" {
		payload, _ := json.Marshal(map[string]string{
			"token":    token,
			"protocol": "pimpam",
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
				var result struct{ Valid bool `json:"valid"` }
				if json.Unmarshal(data, &result) == nil {
					return result.Valid
				}
			}
		}
	}

	// Fallback VoidDB
	if s.voiddbURL == "" || s.voiddbToken == "" {
		return false
	}
	query, _ := json.Marshal(map[string]interface{}{
		"where": map[string]interface{}{"field": "token", "op": "eq", "value": token},
		"limit": 1,
	})
	url := fmt.Sprintf("%s/v1/databases/lowkey/vpn_tokens/query", s.voiddbURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(query))
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
	data, _ := io.ReadAll(resp.Body)
	var result struct {
		Results []map[string]interface{} `json:"results"`
	}
	if err := json.Unmarshal(data, &result); err != nil || len(result.Results) == 0 {
		return false
	}
	tokenDoc := result.Results[0]
	if exp, _ := tokenDoc["expiresAt"].(string); exp != "" {
		if t, err := time.Parse(time.RFC3339, exp); err == nil && time.Now().After(t) {
			return false
		}
	}
	return true
}

// ─── Stats & Registration ─────────────────────────────────────────────────────

func (s *PimpamServer) recordStat(token, domain string, bytes uint64) {
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

func (s *PimpamServer) flushStats(ctx context.Context) {
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
			"protocol": "pimpam",
		})
	}
	s.statsMap = make(map[string]*domainStat)
	s.statsMu.Unlock()

	if s.backendURL == "" {
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{"serverID": s.serverID, "entries": entries})
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

func (s *PimpamServer) registerServer(ctx context.Context) {
	if s.backendURL == "" {
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"ip":                 s.serverIP,
		"port":               8443,
		"serverType":         "pimpam",
		"supportedProtocols": []string{"pimpam"},
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
		slog.Info("registered", "server_id", s.serverID)
	}
}

func (s *PimpamServer) sendHeartbeat(ctx context.Context) {
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

func generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
