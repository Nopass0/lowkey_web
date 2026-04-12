package jopa

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"sync"
	"time"

	"golang.org/x/crypto/curve25519"
)

// Config — конфигурация JOPA сервера.
type Config struct {
	PSK        [32]byte
	PrivateKey [32]byte
	ListenHost string // "0.0.0.0"
	Port       uint16 // 0 = derive from PSK
	RatchetSec int    // default 60
}

// Server — JOPA сервер.
type Server struct {
	config   Config
	hooks    Hooks
	sessions sync.Map // [4]byte tag → *Session
	pubKey   [32]byte
	log      *slog.Logger
}

// NewServer — создать сервер.
func NewServer(cfg Config, hooks Hooks) *Server {
	if hooks == nil {
		hooks = DefaultHooks{}
	}
	if cfg.RatchetSec == 0 {
		cfg.RatchetSec = 60
	}

	var pubKey [32]byte
	curve25519.ScalarBaseMult(&pubKey, &cfg.PrivateKey)

	return &Server{
		config: cfg,
		hooks:  hooks,
		pubKey: pubKey,
		log:    slog.Default(),
	}
}

// Start — запустить UDP листенер (блокирующий).
func (s *Server) Start(ctx context.Context) error {
	port := s.config.Port
	if port == 0 {
		port = DerivePort(s.config.PSK)
	}

	addr := fmt.Sprintf("%s:%d", s.config.ListenHost, port)
	conn, err := net.ListenPacket("udp", addr)
	if err != nil {
		return fmt.Errorf("listen UDP %s: %w", addr, err)
	}
	defer conn.Close()
	if udpConn, ok := conn.(*net.UDPConn); ok {
		_ = udpConn.SetReadBuffer(4 * 1024 * 1024)
		_ = udpConn.SetWriteBuffer(4 * 1024 * 1024)
	}

	s.log.Info("JOPA server started", "addr", addr)

	buf := make([]byte, 65535)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		n, raddr, err := conn.ReadFrom(buf)
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				continue
			}
			s.log.Error("UDP read error", "err", err)
			continue
		}

		pkt := make([]byte, n)
		copy(pkt, buf[:n])
		go s.handlePacket(ctx, conn, pkt, raddr)
	}
}

func (s *Server) handlePacket(ctx context.Context, conn net.PacketConn, pkt []byte, raddr net.Addr) {
	// De-XOR
	XORPacket(pkt, s.config.PSK)

	if len(pkt) < 1 {
		return
	}

	// Session tag is inside encrypted frame payload.
	// Try active sessions first; if none matches, treat packet as handshake.
	if s.tryHandleSessionPacket(ctx, conn, pkt, raddr) {
		return
	}

	// New connection handshake
	s.handleHandshake(ctx, conn, pkt, raddr)
}

func (s *Server) tryHandleSessionPacket(ctx context.Context, conn net.PacketConn, pkt []byte, raddr net.Addr) bool {
	handled := false
	s.sessions.Range(func(_, value any) bool {
		sess := value.(*Session)

		plaintext, err := sess.Cipher.Decrypt(pkt)
		if err != nil {
			return true
		}
		frame, err := DecodeFrame(plaintext)
		if err != nil {
			return true
		}
		if frame.SessionTag != sess.Tag {
			return true
		}

		sess.Addr = raddr
		s.handleDecodedFrame(ctx, conn, sess, frame)
		handled = true
		return false
	})
	return handled
}

func (s *Server) handleHandshake(ctx context.Context, conn net.PacketConn, pkt []byte, raddr net.Addr) {
	if len(pkt) < 32+24+16 {
		return // слишком короткий — probe, молчим
	}

	var clientPub [32]byte
	copy(clientPub[:], pkt[:32])

	// ECDH
	var shared [32]byte
	curve25519.ScalarMult(&shared, &s.config.PrivateKey, &clientPub)

	cipher := NewSessionCipher(shared, s.config.PSK)

	plaintext, err := cipher.Decrypt(pkt[32:])
	if err != nil {
		s.log.Debug("handshake decrypt failed (probe?)", "addr", raddr)
		return
	}

	var reg struct {
		Token  string     `json:"token"`
		Device ClientInfo `json:"device"`
	}
	if err := json.Unmarshal(plaintext, &reg); err != nil {
		s.log.Debug("handshake json parse failed", "addr", raddr, "err", err)
		return
	}
	reg.Device.Token = reg.Token

	// Hook: CheckAccess
	access := s.hooks.CheckAccess(ctx, reg.Device)

	if !access.Allowed {
		if access.RejectSilent {
			return
		}
		resp, _ := json.Marshal(map[string]any{
			"status":       "denied",
			"redirect_url": access.RedirectURL,
			"message":      access.Message,
		})
		s.sendHandshakeResponse(conn, raddr, cipher, resp)
		return
	}

	// Создаём session tag = BLAKE3(cipher.key)[:4]
	tag := Blake3Tag(cipher.key[:])

	// PSK в метаданных (для XOR в sendFrame)
	meta := map[string]string{}
	if access.Metadata != nil {
		meta = access.Metadata
	}

	session := &Session{
		ID:       generateID(),
		Tag:      tag,
		Cipher:   cipher,
		Client:   reg.Device,
		Addr:     raddr,
		Metadata: meta,
		sendConn: conn,
		psk:      s.config.PSK,
	}
	s.sessions.Store(tag, session)

	s.hooks.OnConnect(ctx, reg.Device)

	// Запустить cleanup при отсутствии трафика > 5 мин
	go s.sessionKeepalive(ctx, tag, session)

	resp, _ := json.Marshal(map[string]any{
		"status": "ok",
		"tag":    fmt.Sprintf("%x", tag),
		"config": map[string]any{
			"ratchet_interval": s.config.RatchetSec,
		},
	})
	s.sendHandshakeResponse(conn, raddr, cipher, resp)

	s.log.Info("client connected",
		"addr", raddr,
		"token", reg.Device.Token,
		"platform", reg.Device.Platform,
		"device_id", reg.Device.DeviceID,
	)
}

func (s *Server) handleSessionPacket(ctx context.Context, conn net.PacketConn, sess *Session, pkt []byte) {
	plaintext, err := sess.Cipher.Decrypt(pkt)
	if err != nil {
		s.log.Debug("session decrypt failed", "session", sess.ID)
		return
	}

	frame, err := DecodeFrame(plaintext)
	if err != nil {
		return
	}

	s.handleDecodedFrame(ctx, conn, sess, frame)
}

func (s *Server) handleDecodedFrame(ctx context.Context, conn net.PacketConn, sess *Session, frame *Frame) {
	switch frame.Type {
	case FrameConnect:
		s.handleConnect(ctx, sess, frame)

	case FrameData:
		s.handleData(ctx, sess, frame)

	case FrameDatagram:
		go s.handleDatagram(ctx, sess, frame)

	case FramePacket:
		go s.handlePacketFrame(ctx, sess, frame)

	case FrameClose:
		s.handleClose(ctx, sess, frame)

	case FrameControl:
		ack := &Frame{Type: FrameAck, StreamID: frame.StreamID}
		sess.SendFrame(ack)

	case FrameAck:
		if len(frame.Payload) < 4 {
			return
		}
		seq := binary.LittleEndian.Uint32(frame.Payload[:4])
		key := sess.ackKey(frame.StreamID, seq)
		if chAny, ok := sess.ackWaiters.Load(key); ok {
			sess.ackWaiters.Delete(key)
			ch := chAny.(chan struct{})
			close(ch)
		} else {
			sess.markAcked(frame.StreamID, seq)
		}
	}
}

func (s *Server) handlePacketFrame(ctx context.Context, sess *Session, frame *Frame) {
	ip := frame.Payload
	dstIP, srcIP, dstPort, srcPort, udpPayload, ok := parseIPv4UDP(ip)
	if !ok {
		return
	}

	flow := FlowInfo{
		SessionID: sess.ID,
		DeviceID:  sess.Client.DeviceID,
		Token:     sess.Client.Token,
		Domain:    dstIP.String(),
		DestIP:    dstIP.String(),
		DestPort:  dstPort,
		Protocol:  "udp-ip",
		StartedAt: time.Now().UnixMilli(),
		BytesUp:   uint64(len(udpPayload)),
	}
	action := s.hooks.OnTraffic(ctx, flow)
	if action.Block {
		s.sendPolicyNotice(sess, frame.StreamID, action, flow.Domain, flow.DestPort)
		return
	}
	if action.RedirectHost != "" || action.RedirectURL != "" || action.DNSOverride != "" {
		dstIP, dstPort = applyPacketRedirect(dstIP, dstPort, action)
		flow.DestIP = dstIP.String()
		flow.DestPort = dstPort
		s.sendPolicyNotice(sess, frame.StreamID, action, flow.DestIP, flow.DestPort)
	}

	remoteAddr := &net.UDPAddr{IP: dstIP, Port: int(dstPort)}
	udpConn, err := net.DialUDP("udp", nil, remoteAddr)
	if err != nil {
		return
	}
	defer udpConn.Close()

	_ = udpConn.SetWriteDeadline(time.Now().Add(3 * time.Second))
	if _, err := udpConn.Write(udpPayload); err != nil {
		return
	}

	respBuf := make([]byte, 65535)
	_ = udpConn.SetReadDeadline(time.Now().Add(3 * time.Second))
	n, err := udpConn.Read(respBuf)
	if err != nil || n <= 0 {
		return
	}

	replyPacket := buildIPv4UDPPacket(
		dstIP, // response src = original dst
		srcIP, // response dst = original src
		dstPort,
		srcPort,
		respBuf[:n],
	)
	if len(replyPacket) == 0 {
		return
	}

	out := &Frame{
		Type:     FramePacket,
		StreamID: frame.StreamID,
		Payload:  replyPacket,
	}
	if err := sess.SendFrame(out); err != nil {
		return
	}
	flow.BytesDown = uint64(n)
	s.hooks.OnFlowComplete(ctx, flow)
}

func (s *Server) handleConnect(ctx context.Context, sess *Session, frame *Frame) {
	payload, err := DecodeConnectPayload(frame.Payload)
	if err != nil {
		return
	}
	if payload.Addr == "" || payload.Port == 0 {
		_ = sess.SendFrame(&Frame{Type: FrameClose, StreamID: frame.StreamID, Payload: []byte("bad connect payload")})
		return
	}

	targetHost := payload.Addr
	targetPort := payload.Port
	flow := FlowInfo{
		SessionID: sess.ID,
		DeviceID:  sess.Client.DeviceID,
		Token:     sess.Client.Token,
		Domain:    targetHost,
		DestIP:    targetHost,
		DestPort:  targetPort,
		Protocol:  "tcp",
		StartedAt: time.Now().UnixMilli(),
	}

	action := s.hooks.OnTraffic(ctx, flow)
	if action.Block {
		s.sendPolicyNotice(sess, frame.StreamID, action, flow.Domain, flow.DestPort)
		reason := action.Reason
		if reason == "" {
			reason = "blocked by policy"
		}
		_ = sess.SendFrame(&Frame{Type: FrameClose, StreamID: frame.StreamID, Payload: []byte(reason)})
		return
	}
	if action.RedirectHost != "" || action.RedirectURL != "" || action.DNSOverride != "" {
		targetHost, targetPort = applyHostPortRedirect(targetHost, targetPort, action)
		flow.Domain = targetHost
		flow.DestIP = targetHost
		flow.DestPort = targetPort
		s.sendPolicyNotice(sess, frame.StreamID, action, flow.Domain, flow.DestPort)
	}
	if len(action.RewriteUp) > 0 || len(action.RewriteDown) > 0 ||
		action.MaxPayload > 0 || action.Window > 0 || action.AckTimeoutMs > 0 || action.MaxRetries > 0 {
		s.sendPolicyNotice(sess, frame.StreamID, action, flow.Domain, flow.DestPort)
	}

	addr := net.JoinHostPort(targetHost, fmt.Sprintf("%d", targetPort))
	rawConn, err := net.DialTimeout("tcp", addr, 8*time.Second)
	if err != nil {
		_ = sess.SendFrame(&Frame{Type: FrameClose, StreamID: frame.StreamID, Payload: []byte(err.Error())})
		return
	}
	// When the client is doing SSL interception it sends plaintext HTTP through
	// the tunnel, so the server must wrap the upstream TCP connection in TLS.
	var conn net.Conn = rawConn
	if payload.TLSUpstream {
		tlsCfg := &tls.Config{ServerName: targetHost, InsecureSkipVerify: false}
		tlsConn := tls.Client(rawConn, tlsCfg)
		if err := tlsConn.Handshake(); err != nil {
			rawConn.Close()
			_ = sess.SendFrame(&Frame{Type: FrameClose, StreamID: frame.StreamID, Payload: []byte("tls handshake: " + err.Error())})
			return
		}
		conn = tlsConn
	}

	st := newStream(frame.StreamID, targetHost, targetPort)
	st.txConfig = applyStreamTxOverrides(st.txConfig, action)
	st.conn = conn
	st.RewriteUp = action.RewriteUp
	st.RewriteDown = action.RewriteDown
	sess.AddStream(st)
	st.startWriter()

	_ = sess.SendFrame(&Frame{Type: FrameConnectAck, StreamID: frame.StreamID})
	go s.streamReader(ctx, sess, st, flow)
}

func (s *Server) handleDatagram(ctx context.Context, sess *Session, frame *Frame) {
	decoded, err := DecodeDatagramPayload(frame.Payload)
	if err != nil {
		return
	}

	targetHost := decoded.Addr
	targetPort := decoded.Port
	payload := decoded.Data

	flow := FlowInfo{
		SessionID: sess.ID,
		DeviceID:  sess.Client.DeviceID,
		Token:     sess.Client.Token,
		Domain:    targetHost,
		DestIP:    targetHost,
		DestPort:  targetPort,
		Protocol:  "udp",
		StartedAt: time.Now().UnixMilli(),
		BytesUp:   uint64(len(payload)),
	}
	action := s.hooks.OnTraffic(ctx, flow)
	if action.Block {
		s.sendPolicyNotice(sess, frame.StreamID, action, flow.Domain, flow.DestPort)
		return
	}
	if action.RedirectHost != "" || action.RedirectURL != "" || action.DNSOverride != "" {
		targetHost, targetPort = applyHostPortRedirect(targetHost, targetPort, action)
		flow.Domain = targetHost
		flow.DestIP = targetHost
		flow.DestPort = targetPort
		s.sendPolicyNotice(sess, frame.StreamID, action, flow.Domain, flow.DestPort)
	}
	if len(action.RewriteUp) > 0 {
		payload = applyRewriteRules(payload, action.RewriteUp)
	}

	remote := net.JoinHostPort(targetHost, fmt.Sprintf("%d", targetPort))
	var udpConn net.Conn
	if binding, ok := sess.GetUDPBinding(frame.StreamID); ok {
		if binding.Remote == remote && !binding.closed.Load() {
			udpConn = binding.conn
		} else {
			sess.RemoveUDPBinding(frame.StreamID)
		}
	}
	if udpConn == nil {
		conn, err := net.Dial("udp", remote)
		if err != nil {
			return
		}
		udpConn = conn
		sess.AddUDPBinding(&UDPBinding{StreamID: frame.StreamID, Remote: remote, conn: udpConn})
	}

	_ = udpConn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	if _, err := udpConn.Write(payload); err != nil {
		return
	}
	respBuf := make([]byte, 65535)
	_ = udpConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	n, err := udpConn.Read(respBuf)
	if err != nil || n <= 0 {
		return
	}
	resp := respBuf[:n]
	if len(action.RewriteDown) > 0 {
		resp = applyDownstreamRewrite(resp, action.RewriteDown)
	}
	replyPayload := EncodeDatagramPayload(targetHost, targetPort, resp)
	_ = sess.SendFrame(&Frame{Type: FrameDatagram, StreamID: frame.StreamID, Payload: replyPayload})

	flow.BytesDown = uint64(len(resp))
	s.hooks.OnFlowComplete(ctx, flow)
}

func (s *Server) streamReader(ctx context.Context, sess *Session, st *Stream, flow FlowInfo) {
	defer func() {
		st.closed.Store(true)
		st.closeSendCh()
		if st.conn != nil {
			_ = st.conn.Close()
		}
		sess.RemoveStream(st.ID)
		flow.BytesUp = st.bytesUp.Load()
		flow.BytesDown = st.bytesDown.Load()
		s.hooks.OnFlowComplete(ctx, flow)
		_ = sess.SendFrame(&Frame{Type: FrameClose, StreamID: st.ID})
	}()

	// readCh decouples TCP reads from UDP ACK waiting.
	// The TCP reader goroutine keeps filling the channel while the sender waits
	// for ACKs, preventing TCP receive-buffer stalls on large transfers (video/media).
	readCh := make(chan []byte, 32)

	go func() {
		defer close(readCh)
		buf := make([]byte, 65536)

		if len(st.RewriteDown) > 0 {
			// Buffered mode: accumulate the full response before processing.
			// Required because:
			//   1. </body> injection may fall in a different chunk than the HTTP headers
			//   2. Chunked transfer-encoding must be decoded BEFORE rewriting
			//      (body injection would invalidate embedded chunk-size lines)
			//   3. Content-Length must be stripped from the headers chunk once we know
			//      the body has been modified.
			var full []byte
			for {
				n, err := st.conn.Read(buf)
				if n > 0 {
					full = append(full, buf[:n]...)
				}
				if err != nil {
					if err != io.EOF {
						s.log.Info("stream read error (buffered)", "dest", fmt.Sprintf("%s:%d", st.DestAddr, st.DestPort), "stream", st.ID, "err", err)
					}
					break
				}
			}
			if len(full) > 0 {
				processed := applyFullResponseRewrite(full, st.RewriteDown)
				select {
				case readCh <- processed:
				case <-ctx.Done():
				}
			}
			return
		}

		// Streaming mode: no rewrite rules — pipe in 64 KB chunks.
		for {
			n, err := st.conn.Read(buf)
			if n > 0 {
				chunk := make([]byte, n)
				copy(chunk, buf[:n])
				select {
				case readCh <- chunk:
				case <-ctx.Done():
					return
				}
			}
			if err != nil {
				if err != io.EOF {
					s.log.Info("stream read error", "dest", fmt.Sprintf("%s:%d", st.DestAddr, st.DestPort), "stream", st.ID, "err", err)
				}
				return
			}
		}
	}()

	for payload := range readCh {
		if err := sess.SendDataReliable(st, payload); err != nil {
			return
		}
		st.bytesDown.Add(uint64(len(payload)))
	}
}

func (s *Server) handleData(ctx context.Context, sess *Session, frame *Frame) {
	s.log.Debug("handleData received", "session", sess.ID, "stream", frame.StreamID, "pid", frame.Sequence, "len", len(frame.Payload))
	v, ok := sess.Streams.Load(frame.StreamID)
	if !ok {
		return
	}
	st := v.(*Stream)
	if st.closed.Load() || st.conn == nil {
		return
	}

	if len(frame.Payload) < 4 {
		return
	}
	seq := binary.LittleEndian.Uint32(frame.Payload[:4])
	data := frame.Payload[4:]
	// When stream has downstream rewrites (HTML injection), force uncompressed upstream
	// response by stripping Accept-Encoding — compressed bodies can't be text-searched.
	if len(st.RewriteDown) > 0 {
		data = stripAcceptEncoding(data)
	}
	payload := applyRewriteRules(data, st.RewriteUp)

	var toDeliver [][]byte
	st.rxMu.Lock()
	if st.rxBuf == nil {
		st.rxBuf = make(map[uint32][]byte)
	}
	expected := st.rxExpected.Load()
	if expected == 0 {
		expected = 1
		st.rxExpected.Store(1)
	}
	if seq < expected {
		st.rxMu.Unlock()
		_ = sess.SendAck(frame.StreamID, seq)
		return
	}
	if seq == expected {
		toDeliver = append(toDeliver, payload)
		expected++
		for {
			if next, ok := st.rxBuf[expected]; ok {
				toDeliver = append(toDeliver, next)
				delete(st.rxBuf, expected)
				expected++
			} else {
				break
			}
		}
		st.rxExpected.Store(expected)
	} else {
		window := st.txConfig.Window
		if window <= 0 {
			window = streamWindow
		}
		if len(st.rxBuf) < window*4 {
			st.rxBuf[seq] = payload
		}
	}
	st.rxMu.Unlock()
	_ = sess.SendAck(frame.StreamID, seq)

	for _, item := range toDeliver {
		st.bytesUp.Add(uint64(len(item)))
		func() {
			defer func() { recover() }()
			select {
			case st.sendCh <- item:
			default:
				st.closed.Store(true)
				st.closeSendCh()
				closeFrame := &Frame{Type: FrameClose, StreamID: frame.StreamID}
				sess.SendFrame(closeFrame)
			}
		}()
	}
}

func applyStreamTxOverrides(cfg StreamTxConfig, action TrafficAction) StreamTxConfig {
	if action.MaxPayload > 0 {
		cfg.MaxPayload = clampInt(action.MaxPayload, 256, 1400)
	}
	if action.Window > 0 {
		cfg.Window = clampInt(action.Window, 1, 2048)
	}
	if action.AckTimeoutMs > 0 {
		ms := clampInt(action.AckTimeoutMs, 50, 5000)
		cfg.AckTimeout = time.Duration(ms) * time.Millisecond
	}
	if action.MaxRetries > 0 {
		cfg.MaxRetries = clampInt(action.MaxRetries, 1, 32)
	}
	return cfg
}

func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func (s *Server) handleClose(ctx context.Context, sess *Session, frame *Frame) {
	v, ok := sess.Streams.Load(frame.StreamID)
	if ok {
		st := v.(*Stream)
		st.closed.Store(true)
		st.closeSendCh()
		if st.conn != nil {
			st.conn.Close()
		}
		sess.RemoveStream(frame.StreamID)
		return
	}
	if _, ok := sess.GetUDPBinding(frame.StreamID); ok {
		sess.RemoveUDPBinding(frame.StreamID)
	}
}

func (s *Server) sendHandshakeResponse(conn net.PacketConn, raddr net.Addr, cipher *SessionCipher, payload []byte) {
	encrypted, err := cipher.Encrypt(payload)
	if err != nil {
		return
	}

	// Server eph pubkey placeholder (32 random bytes — клиент его не использует в текущей версии)
	var serverEph [32]byte
	rand.Read(serverEph[:])

	response := make([]byte, 32+len(encrypted))
	copy(response[:32], serverEph[:])
	copy(response[32:], encrypted)

	XORPacket(response, s.config.PSK)
	conn.WriteTo(response, raddr)
}

func (s *Server) sessionKeepalive(ctx context.Context, tag [4]byte, sess *Session) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	// Простой cleanup — удаляем сессию через 30 минут неактивности
	timeout := time.NewTimer(30 * time.Minute)
	defer timeout.Stop()

	select {
	case <-ctx.Done():
	case <-timeout.C:
		s.sessions.Delete(tag)
		s.hooks.OnDisconnect(ctx, sess.ID, sess.Client.DeviceID)
		s.log.Info("session expired", "session", sess.ID)
	}
}

func generateID() string {
	var b [8]byte
	rand.Read(b[:])
	return fmt.Sprintf("%x", b)
}
