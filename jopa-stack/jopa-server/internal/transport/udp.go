// UDPServer — сервер регистрации устройств JOPA (порт :9100).
//
// Роль в архитектуре:
//   Клиент отправляет UDP-пакет с JSON-структурой RegisterRequest.
//   Сервер проверяет sub_token через Gate, регистрирует устройство
//   через Registry и отвечает RegisterResponse с PSK-ключом.
//
// Почему UDP, а не TCP?
//   Регистрация — это одиночный обмен запрос/ответ без состояния.
//   UDP дешевле в установке соединения и менее заметен для DPI.
//
// PSK (Pre-Shared Key):
//   Сервер генерирует случайный 32-байтовый ключ при каждой регистрации.
//   Сейчас он не используется для шифрования напрямую — это задел
//   для будущего добавления ChaCha20/AES шифрования туннеля.
//
// Масштабирование:
//   Каждый UDP-пакет обрабатывается в отдельной горутине (go s.handlePacket).
//   Буфер чтения — 64 КБ (максимальный UDP-пакет).
//   SetReadDeadline(2 сек) позволяет корректно обработать ctx.Done().
package transport

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"net"
	"time"

	"jopa-stack/jopa-server/internal/device"
	"jopa-stack/jopa-server/internal/protocol"
	"jopa-stack/jopa-server/internal/subscription"
)

// UDPServer слушает UDP-порт и обрабатывает пакеты регистрации устройств.
type UDPServer struct {
	addr     string             // адрес для bind (напр. ":9100")
	gate     *subscription.Gate // проверка подписки
	registry *device.Registry   // сохранение/обновление записи устройства в VoidDB
}

// NewUDPServer создаёт UDPServer.
func NewUDPServer(addr string, gate *subscription.Gate, registry *device.Registry) *UDPServer {
	return &UDPServer{addr: addr, gate: gate, registry: registry}
}

// Run запускает UDP listener. Блокирующий метод.
//
// Цикл чтения:
//   - SetReadDeadline(2 сек) — позволяет выходить из ReadFrom() для проверки ctx.
//   - Каждый пакет → отдельная горутина handlePacket.
//   - Timeout-ошибки игнорируются (это нормальный поток управления).
func (s *UDPServer) Run(ctx context.Context) error {
	conn, err := net.ListenPacket("udp", s.addr)
	if err != nil {
		return err
	}
	defer conn.Close()

	log.Printf("[JOPA/UDP] listening on %s", s.addr)

	buf := make([]byte, 64*1024) // максимальный размер UDP-датаграммы
	for {
		// Проверяем контекст отмены (graceful shutdown).
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		// Блокируем максимум 2 секунды — потом проверяем ctx снова.
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))

		n, addr, err := conn.ReadFrom(buf)
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				continue // deadline — ок, проверяем ctx
			}
			continue // прочие ошибки (напр. ICMP unreachable) — игнорируем
		}

		// Копируем байты пакета, т.к. buf переиспользуется в следующей итерации.
		pkt := make([]byte, n)
		copy(pkt, buf[:n])
		go s.handlePacket(ctx, conn, addr, pkt)
	}
}

// handlePacket обрабатывает один UDP-пакет от клиента.
//
// Шаги:
//  1. Декодируем JSON → RegisterRequest. При ошибке — отвечаем статусом "error".
//  2. Проверяем sub_token через Gate. Если нет активной подписки — "expired".
//  3. Регистрируем устройство в VoidDB (upsert).
//  4. Отвечаем клиенту JSON с PSK и временем истечения.
func (s *UDPServer) handlePacket(ctx context.Context, conn net.PacketConn, addr net.Addr, pkt []byte) {
	// ── Шаг 1: Парсим JSON ────────────────────────────────────────
	req, err := protocol.DecodeRegister(pkt)
	if err != nil {
		// Невалидный пакет — отвечаем и выходим.
		_, _ = conn.WriteTo(protocol.EncodeResponse(protocol.RegisterResponse{
			Type: "registered", Status: "error", Message: "bad packet",
		}), addr)
		return
	}

	// ── Шаг 2: Проверяем подписку ─────────────────────────────────
	decision := s.gate.Check(ctx, req.SubToken)
	if decision.Status != subscription.StatusActive && decision.Status != subscription.StatusTrial {
		// Подписка не активна → отвечаем "expired" с URL продления.
		_, _ = conn.WriteTo(protocol.EncodeResponse(protocol.RegisterResponse{
			Type: "registered", Status: "expired", RedirectURL: decision.RedirectURL,
		}), addr)
		return
	}

	// ── Шаг 3: Регистрируем устройство в VoidDB ───────────────────
	// Ошибка регистрации некритична — клиент всё равно получит PSK
	// и сможет работать. Запись устройства нужна только для аудита.
	_ = s.registry.Register(ctx, device.RegisterInput{
		SubToken:      req.SubToken,
		DeviceID:      req.DeviceID,
		DeviceToken:   req.DeviceTok,
		Platform:      req.Device.Platform,
		OSVersion:     req.Device.OSVersion,
		DeviceModel:   req.Device.DeviceModel,
		ClientVersion: req.Device.ClientVersion,
		LastIP:        addr.String(), // IP:port отправителя UDP-пакета
	})

	// ── Шаг 4: Отвечаем клиенту ──────────────────────────────────
	_, _ = conn.WriteTo(protocol.EncodeResponse(protocol.RegisterResponse{
		Type:      "registered",
		Status:    "ok",
		PSK:       randomPSK(),                          // случайный ключ для этой сессии
		ExpiresAt: decision.ExpiresAt.Format(time.RFC3339), // когда истекает подписка
	}), addr)
}

// randomPSK генерирует случайный Pre-Shared Key для сессии.
// Формат: "base64:<32 hex байта>" — легко парсится клиентом.
// В будущем этот ключ планируется использовать для шифрования TUN-туннеля.
func randomPSK() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return "base64:" + hex.EncodeToString(b)
}
