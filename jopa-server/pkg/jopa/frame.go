package jopa

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	mrand "math/rand/v2"
)

// FrameType — тип фрейма.
type FrameType uint8

const (
	FrameData    FrameType = 0x01
	FrameAck     FrameType = 0x02
	FrameControl FrameType = 0x05
	// Connect — открыть TCP соединение к dest
	FrameConnect FrameType = 0x10
	// ConnectAck — подтверждение открытия соединения
	FrameConnectAck FrameType = 0x11
	// Close — закрыть stream
	FrameClose    FrameType = 0x12
	FrameDatagram FrameType = 0x20
	FramePacket   FrameType = 0x21
)

// Frame — базовая единица данных в JOPA.
type Frame struct {
	SessionTag [4]byte
	Sequence   uint32
	Type       FrameType
	StreamID   uint16
	Payload    []byte
}

// Encode — serialize + random padding.
func (f *Frame) Encode() []byte {
	payloadLen := len(f.Payload)
	padLen := mrand.IntN(64) // 0-63 байта padding

	buf := make([]byte, 4+4+1+2+2+payloadLen+padLen)
	copy(buf[0:4], f.SessionTag[:])
	binary.LittleEndian.PutUint32(buf[4:8], f.Sequence)
	buf[8] = byte(f.Type)
	binary.LittleEndian.PutUint16(buf[9:11], f.StreamID)
	binary.LittleEndian.PutUint16(buf[11:13], uint16(payloadLen))
	copy(buf[13:13+payloadLen], f.Payload)
	rand.Read(buf[13+payloadLen:]) // random padding

	return buf
}

// DecodeFrame — deserialize, strip padding.
func DecodeFrame(data []byte) (*Frame, error) {
	if len(data) < 13 {
		return nil, fmt.Errorf("frame too short: %d", len(data))
	}

	f := &Frame{}
	copy(f.SessionTag[:], data[0:4])
	f.Sequence = binary.LittleEndian.Uint32(data[4:8])
	f.Type = FrameType(data[8])
	f.StreamID = binary.LittleEndian.Uint16(data[9:11])
	pLen := binary.LittleEndian.Uint16(data[11:13])

	if int(pLen) > len(data)-13 {
		return nil, fmt.Errorf("payload length %d exceeds data", pLen)
	}

	f.Payload = make([]byte, pLen)
	copy(f.Payload, data[13:13+pLen])

	return f, nil
}
