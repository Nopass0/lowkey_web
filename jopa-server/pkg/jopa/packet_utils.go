package jopa

import (
	"encoding/binary"
	"net"
)

// parseIPv4UDP extracts destination/source and UDP payload from a raw IPv4 packet.
// It only accepts IPv4 + UDP packets and returns ok=false for all other packet types.
func parseIPv4UDP(pkt []byte) (dstIP net.IP, srcIP net.IP, dstPort, srcPort uint16, payload []byte, ok bool) {
	if len(pkt) < 20 {
		return nil, nil, 0, 0, nil, false
	}
	version := pkt[0] >> 4
	if version != 4 {
		return nil, nil, 0, 0, nil, false
	}
	ihl := int(pkt[0]&0x0F) * 4
	if ihl < 20 || len(pkt) < ihl+8 {
		return nil, nil, 0, 0, nil, false
	}
	if pkt[9] != 17 { // UDP only
		return nil, nil, 0, 0, nil, false
	}
	totalLen := int(binary.BigEndian.Uint16(pkt[2:4]))
	if totalLen <= 0 || totalLen > len(pkt) {
		totalLen = len(pkt)
	}
	srcIP = net.IPv4(pkt[12], pkt[13], pkt[14], pkt[15]).To4()
	dstIP = net.IPv4(pkt[16], pkt[17], pkt[18], pkt[19]).To4()
	udp := pkt[ihl:totalLen]
	if len(udp) < 8 {
		return nil, nil, 0, 0, nil, false
	}
	srcPort = binary.BigEndian.Uint16(udp[0:2])
	dstPort = binary.BigEndian.Uint16(udp[2:4])
	udpLen := int(binary.BigEndian.Uint16(udp[4:6]))
	if udpLen < 8 || udpLen > len(udp) {
		udpLen = len(udp)
	}
	payload = append([]byte(nil), udp[8:udpLen]...)
	return dstIP, srcIP, dstPort, srcPort, payload, true
}

// buildIPv4UDPPacket assembles a full IPv4 packet with UDP payload and valid checksums.
func buildIPv4UDPPacket(srcIP, dstIP net.IP, srcPort, dstPort uint16, udpPayload []byte) []byte {
	src4 := srcIP.To4()
	dst4 := dstIP.To4()
	if src4 == nil || dst4 == nil {
		return nil
	}
	udpLen := 8 + len(udpPayload)
	totalLen := 20 + udpLen
	pkt := make([]byte, totalLen)

	pkt[0] = 0x45 // v4 + IHL=5
	pkt[1] = 0x00
	binary.BigEndian.PutUint16(pkt[2:4], uint16(totalLen))
	binary.BigEndian.PutUint16(pkt[4:6], 0)
	binary.BigEndian.PutUint16(pkt[6:8], 0)
	pkt[8] = 64
	pkt[9] = 17
	copy(pkt[12:16], src4)
	copy(pkt[16:20], dst4)
	binary.BigEndian.PutUint16(pkt[10:12], ipv4HeaderChecksum(pkt[:20]))

	udp := pkt[20:]
	binary.BigEndian.PutUint16(udp[0:2], srcPort)
	binary.BigEndian.PutUint16(udp[2:4], dstPort)
	binary.BigEndian.PutUint16(udp[4:6], uint16(udpLen))
	copy(udp[8:], udpPayload)
	binary.BigEndian.PutUint16(udp[6:8], udpChecksum(src4, dst4, udp))

	return pkt
}

func ipv4HeaderChecksum(hdr []byte) uint16 {
	var sum uint32
	for i := 0; i+1 < len(hdr); i += 2 {
		sum += uint32(binary.BigEndian.Uint16(hdr[i : i+2]))
	}
	for (sum >> 16) != 0 {
		sum = (sum & 0xFFFF) + (sum >> 16)
	}
	return ^uint16(sum)
}

func udpChecksum(srcIP, dstIP []byte, udp []byte) uint16 {
	var sum uint32
	sum += uint32(binary.BigEndian.Uint16(srcIP[0:2]))
	sum += uint32(binary.BigEndian.Uint16(srcIP[2:4]))
	sum += uint32(binary.BigEndian.Uint16(dstIP[0:2]))
	sum += uint32(binary.BigEndian.Uint16(dstIP[2:4]))
	sum += uint32(17)
	sum += uint32(len(udp))

	for i := 0; i+1 < len(udp); i += 2 {
		sum += uint32(binary.BigEndian.Uint16(udp[i : i+2]))
	}
	if len(udp)%2 != 0 {
		sum += uint32(udp[len(udp)-1]) << 8
	}
	for (sum >> 16) != 0 {
		sum = (sum & 0xFFFF) + (sum >> 16)
	}
	cs := ^uint16(sum)
	if cs == 0 {
		return 0xFFFF
	}
	return cs
}
