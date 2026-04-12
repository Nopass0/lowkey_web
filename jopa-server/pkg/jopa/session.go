package jopa

import (
	"encoding/binary"
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

type Stream struct {
	ID       uint16
	DestAddr string
	DestPort uint16
	// RewriteUp applies to client->remote payload direction.
	RewriteUp []RewriteRule
	// RewriteDown applies to remote->client payload direction.
	RewriteDown []RewriteRule
	txConfig   StreamTxConfig
	bytesUp     atomic.Uint64
	bytesDown   atomic.Uint64
	rxExpected  atomic.Uint32
	txSeq       atomic.Uint32
	rxMu        sync.Mutex
	rxBuf       map[uint32][]byte
	conn        net.Conn
	sendCh      chan []byte
	closeOnce   sync.Once
	closed      atomic.Bool
}

type inflight struct {
	seq     uint32
	payload []byte
	retries int
	ch      chan struct{}
}

// StreamTxConfig controls reliability/throughput tuning for a TCP tunnel stream.
type StreamTxConfig struct {
	MaxPayload int
	Window     int
	AckTimeout time.Duration
	MaxRetries int
}

// UDPBinding keeps stateful UDP association for datagram stream id.
type UDPBinding struct {
	StreamID uint16
	Remote   string
	conn     net.Conn
	closed   atomic.Bool
}

func newStream(id uint16, destAddr string, destPort uint16) *Stream {
	return &Stream{
		ID:       id,
		DestAddr: destAddr,
		DestPort: destPort,
		sendCh:   make(chan []byte, 512),
		txConfig: defaultStreamTxConfig(),
	}
}

// closeSendCh закрывает канал ровно один раз.
func (st *Stream) closeSendCh() {
	st.closeOnce.Do(func() { close(st.sendCh) })
}

// startWriter запускает горутину, которая последовательно пишет данные в conn.
// Это гарантирует правильный порядок записи при параллельных handleData вызовах.
func (st *Stream) startWriter() {
	go func() {
		for data := range st.sendCh {
			st.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err := st.conn.Write(data); err != nil {
				st.closed.Store(true)
				return
			}
		}
	}()
}

type Session struct {
	ID          string
	Tag         [4]byte
	Cipher      *SessionCipher
	Client      ClientInfo
	Addr        net.Addr
	Streams     sync.Map
	UDP         sync.Map
	Metadata    map[string]string
	seqCtr      atomic.Uint32
	mu          sync.Mutex
	sendConn    net.PacketConn
	psk         [32]byte
	ackWaiters  sync.Map
	ackReceived sync.Map
}

const (
	streamMaxPayload = 1300
	streamWindow     = 512
	streamAckTimeout = 1000 * time.Millisecond
	streamMaxRetries = 10
)

func defaultStreamTxConfig() StreamTxConfig {
	return StreamTxConfig{
		MaxPayload: streamMaxPayload,
		Window:     streamWindow,
		AckTimeout: streamAckTimeout,
		MaxRetries: streamMaxRetries,
	}
}

func (s *Session) NextSeq() uint32 {
	return s.seqCtr.Add(1)
}

func (s *Session) GetStream(id uint16) (*Stream, bool) {
	v, ok := s.Streams.Load(id)
	if !ok {
		return nil, false
	}
	return v.(*Stream), true
}

func (s *Session) AddStream(st *Stream) {
	s.Streams.Store(st.ID, st)
}

func (s *Session) RemoveStream(id uint16) {
	s.Streams.Delete(id)
}

func (s *Session) GetUDPBinding(id uint16) (*UDPBinding, bool) {
	v, ok := s.UDP.Load(id)
	if !ok {
		return nil, false
	}
	return v.(*UDPBinding), true
}

func (s *Session) AddUDPBinding(b *UDPBinding) {
	s.UDP.Store(b.StreamID, b)
}

func (s *Session) RemoveUDPBinding(id uint16) {
	if v, ok := s.UDP.Load(id); ok {
		b := v.(*UDPBinding)
		b.closed.Store(true)
		if b.conn != nil {
			_ = b.conn.Close()
		}
	}
	s.UDP.Delete(id)
}

func (s *Session) SendFrame(f *Frame) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	f.SessionTag = s.Tag
	f.Sequence = s.NextSeq()

	encoded := f.Encode()
	encrypted, err := s.Cipher.Encrypt(encoded)
	if err != nil {
		return err
	}

	XORPacket(encrypted, s.psk)
	_, err = s.sendConn.WriteTo(encrypted, s.Addr)
	return err
}

func (s *Session) ackKey(streamID uint16, seq uint32) string {
	return fmt.Sprintf("%d:%d", streamID, seq)
}

func (s *Session) markAcked(streamID uint16, seq uint32) {
	s.ackReceived.Store(s.ackKey(streamID, seq), true)
}

func (s *Session) consumeAck(streamID uint16, seq uint32) bool {
	key := s.ackKey(streamID, seq)
	if _, ok := s.ackReceived.Load(key); ok {
		s.ackReceived.Delete(key)
		return true
	}
	return false
}

func (s *Session) SendAck(streamID uint16, seq uint32) error {
	var payload [4]byte
	binary.LittleEndian.PutUint32(payload[:], seq)
	return s.SendFrame(&Frame{
		Type:     FrameAck,
		StreamID: streamID,
		Payload:  payload[:],
	})
}

func (s *Session) SendDataReliable(st *Stream, data []byte) error {
	cfg := st.txConfig
	maxPayload := cfg.MaxPayload
	window := cfg.Window
	ackTimeout := cfg.AckTimeout
	maxRetries := cfg.MaxRetries
	if maxPayload <= 0 {
		maxPayload = streamMaxPayload
	}
	if window <= 0 {
		window = streamWindow
	}
	if ackTimeout <= 0 {
		ackTimeout = streamAckTimeout
	}
	if maxRetries <= 0 {
		maxRetries = streamMaxRetries
	}

	chunks := make([][]byte, 0, (len(data)/maxPayload)+1)
	for len(data) > 0 {
		n := len(data)
		if n > maxPayload {
			n = maxPayload
		}
		chunks = append(chunks, data[:n])
		data = data[n:]
	}

	inFlight := make([]inflight, 0, window)
	for _, chunk := range chunks {
		entry, err := s.sendChunkOnce(st, chunk, maxRetries)
		if err != nil {
			return err
		}
		inFlight = append(inFlight, entry)
		for len(inFlight) >= window {
			if err := s.awaitFrontAck(st, &inFlight, ackTimeout); err != nil {
				return err
			}
		}
	}
	for len(inFlight) > 0 {
		if err := s.awaitFrontAck(st, &inFlight, ackTimeout); err != nil {
			return err
		}
	}
	return nil
}

func (s *Session) sendChunkOnce(st *Stream, payload []byte, retries int) (inflight, error) {
	seq := st.txSeq.Add(1)
	framed := make([]byte, 4+len(payload))
	binary.LittleEndian.PutUint32(framed[0:4], seq)
	copy(framed[4:], payload)

	ch := make(chan struct{})
	key := s.ackKey(st.ID, seq)
	s.ackWaiters.Store(key, ch)
	if err := s.SendFrame(&Frame{
		Type:     FrameData,
		StreamID: st.ID,
		Payload:  framed,
	}); err != nil {
		s.ackWaiters.Delete(key)
		return inflight{}, err
	}
	return inflight{seq: seq, payload: payload, retries: retries, ch: ch}, nil
}

func (s *Session) awaitFrontAck(st *Stream, inFlight *[]inflight, timeout time.Duration) error {
	if len(*inFlight) == 0 {
		return nil
	}
	entry := (*inFlight)[0]
	if s.consumeAck(st.ID, entry.seq) {
		*inFlight = (*inFlight)[1:]
		return nil
	}
	select {
	case <-entry.ch:
		s.ackWaiters.Delete(s.ackKey(st.ID, entry.seq))
		*inFlight = (*inFlight)[1:]
		return nil
	case <-time.After(timeout):
		if entry.retries <= 0 {
			return fmt.Errorf("data send timeout")
		}
		if s.consumeAck(st.ID, entry.seq) {
			*inFlight = (*inFlight)[1:]
			return nil
		}
		key := s.ackKey(st.ID, entry.seq)
		s.ackWaiters.Delete(key)
		ch := make(chan struct{})
		s.ackWaiters.Store(key, ch)
		framed := make([]byte, 4+len(entry.payload))
		binary.LittleEndian.PutUint32(framed[0:4], entry.seq)
		copy(framed[4:], entry.payload)
		if err := s.SendFrame(&Frame{
			Type:     FrameData,
			StreamID: st.ID,
			Payload:  framed,
		}); err != nil {
			return err
		}
		(*inFlight)[0] = inflight{
			seq:     entry.seq,
			payload: entry.payload,
			retries: entry.retries - 1,
			ch:      ch,
		}
		return nil
	}
}

// ConnectPayload is parsed from FrameConnect payload.
type ConnectPayload struct {
	Addr        string
	Port        uint16
	TLSUpstream bool // flags byte bit 0: server must wrap upstream TCP in TLS
}

// DatagramPayload is parsed from FrameDatagram payload.
type DatagramPayload struct {
	Addr string
	Port uint16
	Data []byte
}

// EncodeConnectPayload serializes connect target into binary frame payload.
func EncodeConnectPayload(addr string, port uint16) []byte {
	addrBytes := []byte(addr)
	buf := make([]byte, 2+2+len(addrBytes))
	binary.LittleEndian.PutUint16(buf[0:2], uint16(len(addrBytes)))
	binary.LittleEndian.PutUint16(buf[2:4], port)
	copy(buf[4:], addrBytes)
	return buf
}

// DecodeConnectPayload deserializes connect target from frame payload.
// Format: [addrLen:2][port:2][addr:addrLen][flags:1?]
// flags bit 0: TLSUpstream
func DecodeConnectPayload(data []byte) (ConnectPayload, error) {
	if len(data) < 4 {
		return ConnectPayload{}, ErrPacketTooShort
	}
	addrLen := binary.LittleEndian.Uint16(data[0:2])
	port := binary.LittleEndian.Uint16(data[2:4])
	if int(addrLen)+4 > len(data) {
		return ConnectPayload{}, ErrPacketTooShort
	}
	addr := string(data[4 : 4+addrLen])
	var tlsUpstream bool
	if len(data) > int(4+addrLen) {
		flags := data[4+addrLen]
		tlsUpstream = flags&0x01 != 0
	}
	return ConnectPayload{Addr: addr, Port: port, TLSUpstream: tlsUpstream}, nil
}

// EncodeDatagramPayload serializes destination and payload for datagram frame.
func EncodeDatagramPayload(addr string, port uint16, payload []byte) []byte {
	addrBytes := []byte(addr)
	dataLen := len(payload)
	if dataLen > 0xFFFF {
		dataLen = 0xFFFF
	}
	buf := make([]byte, 2+2+2+len(addrBytes)+dataLen)
	binary.LittleEndian.PutUint16(buf[0:2], uint16(len(addrBytes)))
	binary.LittleEndian.PutUint16(buf[2:4], port)
	binary.LittleEndian.PutUint16(buf[4:6], uint16(dataLen))
	copy(buf[6:6+len(addrBytes)], addrBytes)
	copy(buf[6+len(addrBytes):], payload[:dataLen])
	return buf
}

// DecodeDatagramPayload deserializes datagram destination and bytes.
func DecodeDatagramPayload(data []byte) (DatagramPayload, error) {
	if len(data) < 6 {
		return DatagramPayload{}, ErrPacketTooShort
	}
	addrLen := binary.LittleEndian.Uint16(data[0:2])
	port := binary.LittleEndian.Uint16(data[2:4])
	dataLen := binary.LittleEndian.Uint16(data[4:6])
	start := 6
	endAddr := start + int(addrLen)
	endData := endAddr + int(dataLen)
	if endData > len(data) {
		return DatagramPayload{}, ErrPacketTooShort
	}
	return DatagramPayload{
		Addr: string(data[start:endAddr]),
		Port: port,
		Data: append([]byte(nil), data[endAddr:endData]...),
	}, nil
}
