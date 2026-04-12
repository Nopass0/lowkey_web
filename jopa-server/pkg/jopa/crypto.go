package jopa

import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"sync"
	"time"

	"golang.org/x/crypto/chacha20poly1305"
	"lukechampine.com/blake3"
)

var ErrPacketTooShort = errors.New("packet too short")

// SessionCipher — шифрование одной сессии (XChaCha20-Poly1305 + ratchet).
type SessionCipher struct {
	mu           sync.Mutex
	key          [32]byte
	nonceCtr     uint64
	ratchetAt    time.Time
	ratchetInt   time.Duration
}

// NewSessionCipher — derive session key из ECDH shared secret + PSK.
func NewSessionCipher(sharedSecret, psk [32]byte) *SessionCipher {
	hourTS := uint64(time.Now().Unix() / 3600)

	h := blake3.New(32, nil)
	h.Write([]byte("jopa-session-v1"))
	h.Write(sharedSecret[:])
	h.Write(psk[:])
	var tsBuf [8]byte
	binary.LittleEndian.PutUint64(tsBuf[:], hourTS)
	h.Write(tsBuf[:])

	var key [32]byte
	copy(key[:], h.Sum(nil))

	return &SessionCipher{
		key:        key,
		ratchetAt:  time.Now(),
		ratchetInt: 60 * time.Second,
	}
}

// Encrypt — XChaCha20-Poly1305, 24-byte nonce.
func (sc *SessionCipher) Encrypt(plaintext []byte) ([]byte, error) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	sc.maybeRatchet()

	aead, err := chacha20poly1305.NewX(sc.key[:])
	if err != nil {
		return nil, err
	}

	nonce := sc.nextNonce()
	// Prepend nonce to ciphertext
	out := make([]byte, chacha20poly1305.NonceSizeX, chacha20poly1305.NonceSizeX+len(plaintext)+chacha20poly1305.Overhead)
	copy(out, nonce[:])
	out = aead.Seal(out, nonce[:], plaintext, nil)
	return out, nil
}

// Decrypt — расшифровка. Nonce берётся из первых 24 байт.
func (sc *SessionCipher) Decrypt(data []byte) ([]byte, error) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	if len(data) < chacha20poly1305.NonceSizeX+chacha20poly1305.Overhead {
		return nil, ErrPacketTooShort
	}

	aead, err := chacha20poly1305.NewX(sc.key[:])
	if err != nil {
		return nil, err
	}

	nonce := data[:chacha20poly1305.NonceSizeX]
	ciphertext := data[chacha20poly1305.NonceSizeX:]
	return aead.Open(nil, nonce, ciphertext, nil)
}

func (sc *SessionCipher) nextNonce() [24]byte {
	sc.nonceCtr++
	var nonce [24]byte
	binary.LittleEndian.PutUint64(nonce[0:8], uint64(time.Now().UnixMilli()))
	binary.LittleEndian.PutUint64(nonce[8:16], sc.nonceCtr)
	rand.Read(nonce[16:24])
	return nonce
}

func (sc *SessionCipher) maybeRatchet() {
	if time.Since(sc.ratchetAt) < sc.ratchetInt {
		return
	}
	h := blake3.New(32, nil)
	h.Write([]byte("jopa-ratchet-v1"))
	h.Write(sc.key[:])
	var ctrBuf [8]byte
	binary.LittleEndian.PutUint64(ctrBuf[:], sc.nonceCtr)
	h.Write(ctrBuf[:])
	var rnd [32]byte
	rand.Read(rnd[:])
	h.Write(rnd[:])
	copy(sc.key[:], h.Sum(nil))
	sc.ratchetAt = time.Now()
}

// XORPacket — скрываем структуру пакета через BLAKE3 XOF stream.
func XORPacket(data []byte, psk [32]byte) {
	h := blake3.New(32, nil)
	h.Write([]byte("jopa-xor-stream-v1"))
	h.Write(psk[:])
	var reader = h.XOF()
	stream := make([]byte, len(data))
	reader.Read(stream)
	for i := range data {
		data[i] ^= stream[i]
	}
}

// DerivePort — вычислить UDP порт из PSK + час. Результат в диапазоне 9000-9100.
func DerivePort(psk [32]byte) uint16 {
	hourTS := uint64(time.Now().Unix() / 3600)
	h := blake3.New(4, nil)
	h.Write([]byte("jopa-port-v1"))
	h.Write(psk[:])
	var tsBuf [8]byte
	binary.LittleEndian.PutUint64(tsBuf[:], hourTS)
	h.Write(tsBuf[:])
	sum := h.Sum(nil)
	port := binary.LittleEndian.Uint16(sum[:2])
	return 9000 + (port % 101) // 9000-9100
}

// Blake3Tag — первые 4 байта BLAKE3 хэша данных.
func Blake3Tag(data []byte) [4]byte {
	h := blake3.Sum256(data)
	var tag [4]byte
	copy(tag[:], h[:4])
	return tag
}
