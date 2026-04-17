// Пакет transport содержит два сервера: RelayServer (TCP) и UDPServer.
//
// ─── RelayServer ─────────────────────────────────────────────────────────────
//
// RelayServer слушает на TCP-порту :9101 и является сердцем протокола JOPA.
// Именно через него проходит весь пользовательский трафик в TUN-режиме:
// браузер, игры, мессенджеры — всё.
//
// Протокол соединения (handshake):
//
//  1. Клиент (jopa_tun.rs) открывает TCP-соединение к :9101.
//  2. Клиент шлёт одну строку JSON + '\n':
//
//     {"type":"open","sub_token":"sub_XXX","target_host":"1.2.3.4","target_port":443}
//
//  3. Сервер проверяет sub_token через Gate (кэш → VoidDB).
//  4. При успехе отвечает: {"status":"ok"}\n
//  5. С этого момента соединение становится прозрачным TCP-туннелем
//     между клиентом и target_host:target_port.
//
// Типы запросов:
//
//   type="open"       — обычный TCP туннель (HTTP, HTTPS, SSH, игры и т.д.)
//   type="udp_tunnel" — постоянный UDP туннель с 2-байтовым framing'ом
//   type="udp_once"   — одиночный UDP-запрос (только DNS :53)
//
// Подсчёт трафика:
//   countingReader/countingWriter атомарно считают байты в обоих направлениях.
//   По завершении соединения данные пишутся в:
//   - jopa_sessions  (отдельная запись на каждое соединение)
//   - jopa_user_protocol_stats (агрегированные счётчики на пользователя)
package transport

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync/atomic"
	"time"

	voidorm "github.com/Nopass0/void_go"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"jopa-stack/jopa-server/internal/storage"
	"jopa-stack/jopa-server/internal/subscription"
)

// RelayServer — TCP relay сервер JOPA.
// Каждое входящее соединение обрабатывается в отдельной горутине.
type RelayServer struct {
	addr  string          // адрес для listen (напр. ":9101")
	store *storage.Store  // VoidDB для сессий, логов, статистики
	gate  *subscription.Gate // «охранник» подписок
}

// relayOpenReq — структура JSON-рукопожатия от клиента.
// Клиент отправляет одну строку JSON + '\n' сразу после установки TCP-соединения.
type relayOpenReq struct {
	Type       string `json:"type"`        // "open", "udp_tunnel", "udp_once"
	Login      string `json:"login"`       // логин пользователя (опционально, для доп. верификации)
	Password   string `json:"password"`    // пароль (только если login задан)
	SubToken   string `json:"sub_token"`   // токен подписки — ОБЯЗАТЕЛЬНЫЙ
	DeviceID   string `json:"device_id"`   // UUID устройства (для логов)
	TargetHost string `json:"target_host"` // хост назначения (IP или hostname)
	TargetPort int    `json:"target_port"` // порт назначения
	PayloadB64 string `json:"payload_b64"` // base64 payload (только для udp_once)
}

// relayResp — JSON-ответ сервера после проверки запроса.
type relayResp struct {
	Status      string `json:"status"`                 // "ok", "error", "unauthorized", "expired"
	Message     string `json:"message,omitempty"`      // текст ошибки
	RedirectURL string `json:"redirect_url,omitempty"` // URL продления подписки
	PayloadB64  string `json:"payload_b64,omitempty"`  // base64 ответ (для udp_once)
}

// NewRelayServer создаёт RelayServer.
func NewRelayServer(addr string, store *storage.Store, gate *subscription.Gate) *RelayServer {
	return &RelayServer{
		addr:  addr,
		store: store,
		gate:  gate,
	}
}

// Run запускает TCP-сервер. Блокирующий метод.
//
// Цикл accept: каждые 2 секунды проверяем ctx.Done() (для graceful shutdown).
// При получении нового соединения запускаем handleConn в горутине.
func (s *RelayServer) Run(ctx context.Context) error {
	ln, err := net.Listen("tcp", s.addr)
	if err != nil {
		return err
	}
	defer ln.Close()

	log.Printf("[JOPA/RELAY] listening on %s", s.addr)
	for {
		// Проверяем контекст отмены.
		select {
		case <-ctx.Done():
			return nil
		default:
		}
		// SetDeadline позволяет выйти из Accept() каждые 2 сек для проверки ctx.Done().
		_ = ln.(*net.TCPListener).SetDeadline(time.Now().Add(2 * time.Second))
		conn, err := ln.Accept()
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				continue // истёк deadline Accept — это нормально
			}
			continue // игнорируем прочие ошибки accept (напр. временная перегрузка сети)
		}
		// Каждое соединение — своя горутина, изолированная от остальных.
		go s.handleConn(conn)
	}
}

// handleConn обрабатывает одно входящее TCP-соединение от клиента.
//
// Жизненный цикл:
//  1. Читаем первую строку JSON (хэндшейк), таймаут 15 сек.
//  2. Валидируем sub_token: проверяем подписку через Gate.
//  3. Если указаны login/password — дополнительно проверяем bcrypt-хэш.
//  4. Определяем тип запроса и делегируем нужному обработчику.
func (s *RelayServer) handleConn(conn net.Conn) {
	defer conn.Close()

	// 15 секунд на весь handshake — защита от медленных клиентов / сканеров.
	_ = conn.SetDeadline(time.Now().Add(15 * time.Second))

	reader := bufio.NewReader(conn)

	// ── Шаг 1: Читаем JSON-рукопожатие ───────────────────────────
	line, err := reader.ReadBytes('\n')
	if err != nil {
		writeRelayResp(conn, relayResp{Status: "error", Message: "failed to read handshake"})
		return
	}

	var req relayOpenReq
	if err = json.Unmarshal(line, &req); err != nil {
		writeRelayResp(conn, relayResp{Status: "error", Message: "invalid json"})
		return
	}

	// ── Шаг 2: Базовая валидация ──────────────────────────────────
	if req.SubToken == "" {
		writeRelayResp(conn, relayResp{Status: "error", Message: "invalid open request: missing sub_token"})
		return
	}
	if req.Type != "open" && req.Type != "udp_tunnel" && req.Type != "udp_once" {
		writeRelayResp(conn, relayResp{Status: "error", Message: "unsupported relay request type"})
		return
	}
	if req.TargetHost == "" || req.TargetPort <= 0 {
		writeRelayResp(conn, relayResp{Status: "error", Message: "invalid target"})
		return
	}

	// Контекст с таймаутом для всех обращений к VoidDB в ходе handshake.
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	// ── Шаг 3: Получаем userId через sub_token ────────────────────
	// sub_token привязан к конкретному пользователю через коллекцию "subscriptions".
	subDoc, err := s.store.FindOne(ctx, "subscriptions", voidorm.NewQuery().Where("token", voidorm.Eq, req.SubToken))
	if err != nil {
		writeRelayResp(conn, relayResp{Status: "unauthorized", Message: "subscription not found"})
		return
	}
	userID := s.store.AsString(subDoc, "userId")

	// ── Шаг 4 (опционально): Верификация login/password ───────────
	// Если клиент передал login+password — дополнительно проверяем bcrypt-хэш.
	// Если не передал — достаточно sub_token (он уже секрет).
	if req.Login != "" && req.Password != "" {
		userDoc, err := s.store.FindOne(ctx, "users", voidorm.NewQuery().Where("login", voidorm.Eq, req.Login))
		if err != nil {
			writeRelayResp(conn, relayResp{Status: "unauthorized", Message: "user not found"})
			return
		}
		// Проверяем, что логин соответствует владельцу подписки.
		if s.store.AsString(userDoc, "_id") != userID {
			writeRelayResp(conn, relayResp{Status: "unauthorized", Message: "user mismatch for subscription"})
			return
		}
		if err = bcrypt.CompareHashAndPassword([]byte(s.store.AsString(userDoc, "passwordHash")), []byte(req.Password)); err != nil {
			writeRelayResp(conn, relayResp{Status: "unauthorized", Message: "bad credentials"})
			return
		}
	}

	// ── Шаг 5: Проверяем подписку через Gate ─────────────────────
	// Gate кэширует результат, поэтому большинство вызовов дешевы.
	decision := s.gate.Check(ctx, req.SubToken)
	if decision.Status != subscription.StatusActive && decision.Status != subscription.StatusTrial {
		// Подписка истекла или не найдена — отклоняем и логируем.
		writeRelayResp(conn, relayResp{Status: "expired", RedirectURL: decision.RedirectURL})
		s.logFlow(req, userID, "denied_expired", 0, "expired subscription")
		return
	}

	log.Printf("[JOPA/RELAY] request type=%s login=%s device=%s sub=%s target=%s:%d",
		req.Type, req.Login, req.DeviceID, req.SubToken, req.TargetHost, req.TargetPort)

	// ── Шаг 6: Делегируем нужному обработчику ─────────────────────
	if req.Type == "udp_once" {
		// Одиночный UDP-запрос (только DNS порт 53).
		s.handleUDPOnce(conn, req, userID)
		return
	}
	if req.Type == "udp_tunnel" {
		// Постоянный UDP-туннель (DNS через длинноживущее соединение).
		s.handleUDPTunnel(conn, req, userID)
		return
	}

	// ── type="open": прозрачный TCP-туннель ───────────────────────
	// Подключаемся к целевому хосту.
	target := net.JoinHostPort(req.TargetHost, fmt.Sprintf("%d", req.TargetPort))
	upstream, err := net.DialTimeout("tcp", target, 8*time.Second)
	if err != nil {
		log.Printf("[JOPA/RELAY] tcp dial failed target=%s err=%v", target, err)
		s.logFlow(req, userID, "tcp_dial_failed", 0, err.Error())
		writeRelayResp(conn, relayResp{Status: "error", Message: "target connect failed"})
		return
	}
	defer upstream.Close()

	// Снимаем deadline — туннель может жить часами.
	_ = conn.SetDeadline(time.Time{})
	writeRelayResp(conn, relayResp{Status: "ok"})
	log.Printf("[JOPA/RELAY] tcp open ok target=%s", target)
	s.logFlow(req, userID, "tcp_open_ok", 0, "")

	// Создаём запись сессии в VoidDB и обновляем счётчики активных соединений.
	sessionID := s.startSession(req, userID)
	s.upsertProtocolStats(req, userID, 1, 1, 0, 0)

	// ── Двунаправленная перекачка данных ─────────────────────────
	// Два потока: клиент→сервер (bytesUp) и сервер→клиент (bytesDown).
	// countingReader/Writer атомарно считают байты без блокировок.
	var bytesUp int64
	var bytesDown int64
	done := make(chan struct{})

	// Горутина: читаем из клиента (через bufio.Reader, т.к. там может быть
	// буферизованные байты после хэндшейка) и пишем на upstream.
	go func() {
		defer close(done)
		_, _ = io.Copy(upstream, &countingReader{r: reader, n: &bytesUp})
		_ = upstream.Close() // если клиент закрыл — закрываем upstream
	}()

	// Основная горутина: читаем из upstream и пишем клиенту.
	_, _ = io.Copy(&countingWriter{w: conn, n: &bytesDown}, upstream)
	<-done // ждём завершения горутины клиент→сервер

	// Финализируем сессию и обновляем агрегированную статистику.
	up := atomic.LoadInt64(&bytesUp)
	down := atomic.LoadInt64(&bytesDown)
	s.finishSession(sessionID, up, down, "disconnected")
	s.upsertProtocolStats(req, userID, 0, -1, up, down)
}

// handleUDPTunnel реализует постоянный UDP-туннель поверх TCP-соединения.
//
// Протокол framing (в обоих направлениях):
//   [2 байта big-endian длина пакета][payload]
//
// Это нужно, т.к. TCP — stream-протокол без границ пакетов,
// а UDP-пакеты должны доставляться целиком.
//
// Используется для UDP-трафика (игры, WebRTC, некоторые DNS-резолверы).
func (s *RelayServer) handleUDPTunnel(conn net.Conn, req relayOpenReq, userID string) {
	target := net.JoinHostPort(req.TargetHost, fmt.Sprintf("%d", req.TargetPort))

	// Диалом UDP на целевой хост.
	upstream, err := net.DialTimeout("udp", target, 5*time.Second)
	if err != nil {
		log.Printf("[JOPA/RELAY] udp-tunnel dial failed target=%s err=%v", target, err)
		s.logFlow(req, userID, "udp_tunnel_dial_failed", 0, err.Error())
		writeRelayResp(conn, relayResp{Status: "error", Message: "target connect failed"})
		return
	}
	defer upstream.Close()

	_ = conn.SetDeadline(time.Time{}) // снимаем deadline — туннель долгоживущий
	writeRelayResp(conn, relayResp{Status: "ok"})
	log.Printf("[JOPA/RELAY] udp-tunnel open ok target=%s", target)
	s.logFlow(req, userID, "udp_tunnel_open_ok", 0, "")

	var bytesUp int64
	var bytesDown int64
	done := make(chan struct{})

	// ── TCP → UDP: клиент шлёт [длина 2B][payload], мы пишем UDP-пакет ──
	go func() {
		defer close(done)
		lenBuf := make([]byte, 2)
		for {
			// Читаем ровно 2 байта длины.
			if _, err := io.ReadFull(conn, lenBuf); err != nil {
				return // соединение закрыто
			}
			pLen := int(lenBuf[0])<<8 | int(lenBuf[1]) // big-endian uint16
			if pLen > 65535 {
				return // некорректный размер — обрываем
			}
			payload := make([]byte, pLen)
			if _, err := io.ReadFull(conn, payload); err != nil {
				return
			}
			if _, err := upstream.Write(payload); err != nil {
				return // UDP-сокет закрылся
			}
			atomic.AddInt64(&bytesUp, int64(pLen))
		}
	}()

	// ── UDP → TCP: читаем UDP-пакет, упаковываем [длина 2B][payload] ─────
	buf := make([]byte, 65536)
	for {
		n, err := upstream.Read(buf) // блокирует до прихода UDP-пакета
		if err != nil {
			break
		}
		// Формируем framing: 2 байта big-endian длины + данные.
		lenBuf := []byte{byte(n >> 8), byte(n & 0xff)}
		if _, err := conn.Write(lenBuf); err != nil {
			break
		}
		if _, err := conn.Write(buf[:n]); err != nil {
			break
		}
		atomic.AddInt64(&bytesDown, int64(n))
	}
	<-done

	up := atomic.LoadInt64(&bytesUp)
	down := atomic.LoadInt64(&bytesDown)
	s.upsertProtocolStats(req, userID, 0, 0, up, down)
}

// handleUDPOnce обрабатывает одиночный UDP-запрос.
//
// Ограничения безопасности:
//   - Принимаются ТОЛЬКО DNS-запросы (target_port == 53).
//     Это предотвращает использование UDP-relay для атак на внутренние сети.
//   - fe80::1 (link-local DNS Windows) заменяется на 1.1.1.1.
//   - 169.254.x / 198.19.x (link-local, NetBIOS) — отбрасываются без ответа.
//
// Формат payload_b64: base64 от сырого UDP-пакета (DNS-запрос).
// Ответ возвращается в поле payload_b64 JSON-ответа.
func (s *RelayServer) handleUDPOnce(conn net.Conn, req relayOpenReq, userID string) {
	targetHost := req.TargetHost
	targetPort := req.TargetPort

	// ── Фильтр: только DNS (порт 53) ─────────────────────────────
	// Защита от использования relay для произвольных UDP атак.
	if targetPort != 53 {
		s.logFlow(req, userID, "udp_filtered_non_dns", 0, "")
		writeRelayResp(conn, relayResp{Status: "ok", PayloadB64: ""})
		return
	}

	// ── Link-local → публичный DNS ────────────────────────────────
	// Windows TUN стек иногда шлёт DNS на fe80::1 (link-local IPv6).
	// На сервере такого интерфейса нет → переадресуем на Cloudflare.
	if strings.EqualFold(targetHost, "fe80::1") && targetPort == 53 {
		targetHost = "1.1.1.1"
	}

	// ── Отбрасываем локальный broadcast (NetBIOS, APIPA) ─────────
	// Windows в TUN-режиме генерирует NetBIOS-трафик на 169.254.x и 198.19.x.
	// Туннелировать его на публичный сервер бессмысленно.
	if strings.HasPrefix(targetHost, "169.254.") || strings.HasPrefix(targetHost, "198.19.") {
		s.logFlow(req, userID, "udp_local_broadcast_ignored", 0, "")
		writeRelayResp(conn, relayResp{Status: "ok", PayloadB64: ""})
		return
	}

	// ── Декодируем base64 payload → сырой DNS-запрос ─────────────
	raw, err := base64.StdEncoding.DecodeString(req.PayloadB64)
	if err != nil {
		writeRelayResp(conn, relayResp{Status: "error", Message: "invalid payload"})
		return
	}

	// ── Отправляем DNS-запрос на целевой сервер ───────────────────
	dst := net.JoinHostPort(targetHost, fmt.Sprintf("%d", targetPort))
	up, err := net.DialTimeout("udp", dst, 5*time.Second)
	if err != nil {
		log.Printf("[JOPA/RELAY] udp dial failed target=%s err=%v", dst, err)
		s.logFlow(req, userID, "udp_dial_failed", 0, err.Error())
		writeRelayResp(conn, relayResp{Status: "error", Message: "udp dial failed"})
		return
	}
	defer up.Close()
	_ = up.SetDeadline(time.Now().Add(12 * time.Second)) // DNS должен ответить быстро

	if _, err = up.Write(raw); err != nil {
		log.Printf("[JOPA/RELAY] udp write failed target=%s err=%v", dst, err)
		s.logFlow(req, userID, "udp_write_failed", 0, err.Error())
		writeRelayResp(conn, relayResp{Status: "error", Message: "udp write failed"})
		return
	}

	// ── Читаем DNS-ответ ──────────────────────────────────────────
	buf := make([]byte, 65535)
	n, err := up.Read(buf)
	if err != nil {
		log.Printf("[JOPA/RELAY] udp read failed target=%s err=%v", dst, err)
		s.logFlow(req, userID, "udp_read_failed", 0, err.Error())
		writeRelayResp(conn, relayResp{Status: "error", Message: "udp read failed"})
		return
	}

	log.Printf("[JOPA/RELAY] udp ok target=%s bytes=%d", dst, n)
	s.logFlow(req, userID, "udp_ok", n, "")

	// Кодируем ответ в base64 и возвращаем клиенту.
	writeRelayResp(conn, relayResp{
		Status:     "ok",
		PayloadB64: base64.StdEncoding.EncodeToString(buf[:n]),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// VoidDB вспомогательные методы
// ─────────────────────────────────────────────────────────────────────────────

// logFlow записывает событие соединения в коллекцию "jopa_connection_logs".
// Используется для аудита и построения статистики top-доменов в админ-панели.
// Ошибки записи в БД игнорируются — логирование не должно ломать туннель.
func (s *RelayServer) logFlow(req relayOpenReq, userID, event string, bytes int, errText string) {
	if s.store == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	doc := voidorm.Doc{
		"timestamp":   time.Now().UTC().Format(time.RFC3339Nano),
		"event":       event,      // напр. "tcp_open_ok", "denied_expired", "udp_ok"
		"type":        req.Type,   // "open", "udp_tunnel", "udp_once"
		"login":       req.Login,
		"user_id":     userID,
		"device_id":   req.DeviceID,
		"sub_token":   req.SubToken,
		"target_host": req.TargetHost,
		"target_port": req.TargetPort,
		"bytes":       bytes,
		"error":       errText,
	}
	_, _ = s.store.Insert(ctx, "jopa_connection_logs", doc)
}

// startSession создаёт запись активной сессии в VoidDB.
// Возвращает _id созданной записи — нужен для finishSession.
func (s *RelayServer) startSession(req relayOpenReq, userID string) string {
	if s.store == nil {
		return ""
	}
	id := uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _ = s.store.Insert(ctx, "jopa_sessions", voidorm.Doc{
		"id":           id,
		"_id":          id,
		"status":       "active",
		"protocol":     "jopa",
		"login":        req.Login,
		"user_id":      userID,
		"sub_token":    req.SubToken,
		"device_id":    req.DeviceID,
		"target_host":  req.TargetHost,
		"target_port":  req.TargetPort,
		"bytes_up":     0,
		"bytes_down":   0,
		"connected_at": now,
		"last_seen_at": now,
	})
	return id
}

// finishSession обновляет сессию: статус, трафик, время отключения.
func (s *RelayServer) finishSession(sessionID string, bytesUp, bytesDown int64, status string) {
	if s.store == nil || sessionID == "" {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _ = s.store.Patch(ctx, "jopa_sessions", sessionID, voidorm.Doc{
		"status":          status,      // "disconnected"
		"bytes_up":        bytesUp,
		"bytes_down":      bytesDown,
		"last_seen_at":    now,
		"disconnected_at": now,
	})
}

// asInt64 универсально преобразует numeric интерфейс к int64.
// VoidDB возвращает числа как float64 (из JSON), поэтому нужна явная конвертация.
func asInt64(v any) int64 {
	switch n := v.(type) {
	case int:
		return int64(n)
	case int32:
		return int64(n)
	case int64:
		return n
	case float32:
		return int64(n)
	case float64:
		return int64(n)
	default:
		return 0
	}
}

// upsertProtocolStats обновляет агрегированные счётчики трафика пользователя.
//
// Параметры-дельты:
//   sessionDelta  — +1 при открытии соединения, 0 при закрытии
//   activeDelta   — +1 при открытии, -1 при закрытии
//   bytesUpDelta  — добавить к total_bytes_up
//   bytesDownDelta — добавить к total_bytes_down
//
// Если запись для пользователя+протокола ещё не существует — создаётся новая.
func (s *RelayServer) upsertProtocolStats(req relayOpenReq, userID string, sessionDelta int64, activeDelta int64, bytesUpDelta int64, bytesDownDelta int64) {
	if s.store == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	doc, err := s.store.FindOne(
		ctx,
		"jopa_user_protocol_stats",
		voidorm.NewQuery().Where("login", voidorm.Eq, req.Login).Where("protocol", voidorm.Eq, "jopa"),
	)
	now := time.Now().UTC().Format(time.RFC3339Nano)

	if err != nil {
		// Первое соединение этого пользователя — создаём запись с нуля.
		active := activeDelta
		if active < 0 {
			active = 0 // не уходим в минус
		}
		sessions := sessionDelta
		if sessions < 0 {
			sessions = 0
		}
		id := uuid.NewString()
		_, _ = s.store.Insert(ctx, "jopa_user_protocol_stats", voidorm.Doc{
			"id":                 id,
			"_id":                id,
			"login":              req.Login,
			"user_id":            userID,
			"protocol":           "jopa",
			"session_count":      sessions,
			"active_connections": active,
			"total_bytes_up":     maxInt64(0, bytesUpDelta),
			"total_bytes_down":   maxInt64(0, bytesDownDelta),
			"last_seen_at":       now,
			"last_device_id":     req.DeviceID,
			"last_sub_token":     req.SubToken,
		})
		return
	}

	// Добавляем дельты к текущим значениям; никогда не уходим в минус.
	currentSessions := asInt64(doc["session_count"])
	currentActive := asInt64(doc["active_connections"])
	currentUp := asInt64(doc["total_bytes_up"])
	currentDown := asInt64(doc["total_bytes_down"])

	_, _ = s.store.Patch(ctx, "jopa_user_protocol_stats", s.store.AsString(doc, "_id"), voidorm.Doc{
		"session_count":      maxInt64(0, currentSessions+sessionDelta),
		"active_connections": maxInt64(0, currentActive+activeDelta),
		"total_bytes_up":     maxInt64(0, currentUp+bytesUpDelta),
		"total_bytes_down":   maxInt64(0, currentDown+bytesDownDelta),
		"last_seen_at":       now,
		"last_device_id":     req.DeviceID,
		"last_sub_token":     req.SubToken,
	})
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// writeRelayResp сериализует relayResp в JSON + '\n' и пишет в соединение.
// Разделитель '\n' важен: клиент (jopa_tun.rs) читает ответ до '\n' побайтово.
func writeRelayResp(w io.Writer, resp relayResp) {
	b, _ := json.Marshal(resp)
	b = append(b, '\n')
	_, _ = w.Write(b)
}

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательные типы для подсчёта трафика
// ─────────────────────────────────────────────────────────────────────────────

// countingReader оборачивает io.Reader и атомарно считает прочитанные байты.
// Используется для подсчёта трафика клиент→сервер (bytesUp).
type countingReader struct {
	r io.Reader
	n *int64 // атомарный счётчик
}

func (c *countingReader) Read(p []byte) (int, error) {
	readN, err := c.r.Read(p)
	if readN > 0 {
		atomic.AddInt64(c.n, int64(readN))
	}
	return readN, err
}

// countingWriter оборачивает io.Writer и атомарно считает записанные байты.
// Используется для подсчёта трафика сервер→клиент (bytesDown).
type countingWriter struct {
	w io.Writer
	n *int64 // атомарный счётчик
}

func (c *countingWriter) Write(p []byte) (int, error) {
	writtenN, err := c.w.Write(p)
	if writtenN > 0 {
		atomic.AddInt64(c.n, int64(writtenN))
	}
	return writtenN, err
}
