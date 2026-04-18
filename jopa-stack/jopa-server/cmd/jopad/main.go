// Точка входа демона jopad — основного процесса JOPA-сервера.
//
// JOPA (Just Obfuscated Proxy Architecture) — кастомный протокол туннелирования
// для Lowkey VPN. Он работает поверх обычного TCP/UDP и не выглядит как VPN
// для DPI-систем глубокой инспекции пакетов.
//
// При старте поднимаются три независимых сервера:
//
//  1. UDPServer  (:9100) — принимает UDP-пакеты регистрации устройств.
//     Клиент отправляет JSON {type, sub_token, device_id, device}, сервер
//     проверяет подписку и отвечает PSK-ключом.
//
//  2. RelayServer (:9101) — TCP-релей для пользовательского трафика.
//     Клиент открывает TCP-соединение, отправляет JSON-запрос на открытие
//     туннеля (type="open"|"udp_tunnel"|"udp_once"), сервер проверяет
//     подписку и проксирует данные к целевому хосту.
//
//  3. HTTP API (:9109) — внутренний REST API для бутстрапа клиента,
//     управления подписками и административных запросов.
//
// Все три компонента работают в одном процессе. При падении любого из них
// (кроме временных сетевых ошибок) программа завершается с фатальной ошибкой,
// а PM2 автоматически её перезапустит (autorestart: true в ecosystem).
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"jopa-stack/jopa-server/internal/api"
	"jopa-stack/jopa-server/internal/config"
	"jopa-stack/jopa-server/internal/device"
	"jopa-stack/jopa-server/internal/rules"
	"jopa-stack/jopa-server/internal/storage"
	"jopa-stack/jopa-server/internal/subscription"
	"jopa-stack/jopa-server/internal/transport"
)

// serverID хранит ID, присвоенный бэкендом при первой регистрации.
var serverID string

// relayPort извлекает числовой порт из строки вида ":7443".
func relayPort(addr string) int {
	s := strings.TrimPrefix(addr, ":")
	if p, err := strconv.Atoi(s); err == nil && p > 0 {
		return p
	}
	return 7443
}

// doRegister регистрирует сервер в бэкенде и запоминает serverId.
func doRegister(cfg *config.Config) {
	if cfg.BackendURL == "" {
		return
	}
	payload := map[string]any{
		"ip":                 cfg.PublicIP,
		"hostname":           cfg.PublicHostname,
		"port":               relayPort(cfg.RelayAddr),
		"supportedProtocols": []string{"jopa", "socks", "pimpam"},
		"serverType":         "jopa",
	}
	data, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", cfg.BackendURL+"/servers/register", bytes.NewReader(data))
	if err != nil {
		log.Printf("[Heartbeat] Register request build failed: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.BackendSecret != "" {
		req.Header.Set("X-Server-Secret", cfg.BackendSecret)
	}
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Heartbeat] Register failed: %v", err)
		return
	}
	defer resp.Body.Close()
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
		if id, ok := result["serverId"].(string); ok && id != "" {
			serverID = id
			log.Printf("[Heartbeat] Registered as server %s", id)
		}
	}
}

// doHeartbeat отправляет периодический heartbeat в бэкенд.
func doHeartbeat(cfg *config.Config) {
	if cfg.BackendURL == "" || serverID == "" {
		doRegister(cfg)
		return
	}
	payload := map[string]any{
		"serverId":          serverID,
		"currentLoad":       0,
		"activeConnections": 0,
	}
	data, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", cfg.BackendURL+"/servers/heartbeat", bytes.NewReader(data))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.BackendSecret != "" {
		req.Header.Set("X-Server-Secret", cfg.BackendSecret)
	}
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Heartbeat] Heartbeat failed: %v", err)
		return
	}
	resp.Body.Close()
}

// startHeartbeatLoop регистрирует сервер при старте и отправляет heartbeat каждые 30 секунд.
func startHeartbeatLoop(ctx context.Context, cfg *config.Config) {
	doRegister(cfg)
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			doHeartbeat(cfg)
		case <-ctx.Done():
			return
		}
	}
}

func main() {
	// Загружаем конфигурацию из переменных окружения / .env файла.
	// Если переменная не задана, используется безопасное дефолтное значение.
	cfg := config.Load()

	// Инициализируем хранилище — обёртку над VoidDB.
	// VoidDB — кастомная документная база данных проекта Lowkey.
	// При истёкшем VOIDDB_TOKEN автоматически выполняется login по username/password.
	store, err := storage.New(cfg)
	if err != nil {
		log.Fatalf("[JOPA] storage init failed: %v", err)
	}

	// Gate — «охранник» подписок. Он кэширует результаты проверки sub_token
	// на SubCacheSeconds секунд, чтобы не долбить VoidDB при каждом пакете.
	gate := subscription.NewGate(store, cfg.RedirectURL, time.Duration(cfg.SubCacheSeconds)*time.Second)

	// Registry — реестр устройств. Записывает/обновляет записи jopa_devices
	// при каждом UDP-регистрационном пакете от клиента.
	registry := device.New(store)

	// Создаём корневой контекст. При вызове cancel() все серверы
	// корректно завершают свой цикл accept/read.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Движок правил (блокировка, редиректы, Lua).
	// Периодически обновляет правила из коллекции client_rules.
	rulesEngine := rules.NewEngine(store)
	go rulesEngine.Start(ctx)

	// ── Heartbeat loop ─────────────────────────────────────
	// Регистрирует сервер в бэкенде при старте и периодически
	// подтверждает что он жив (чтобы monitor не пометил offline).
	go startHeartbeatLoop(ctx, cfg)

	// ── UDP-сервер (регистрация устройств) ────────────────────────
	// Слушает на cfg.UDPAddr (по умолчанию :9100).
	// Каждый пакет обрабатывается в отдельной горутине.
	udp := transport.NewUDPServer(cfg.UDPAddr, gate, registry)
	go func() {
		if err := udp.Run(ctx); err != nil {
			log.Fatalf("[JOPA] UDP server failed: %v", err)
		}
	}()

	// ── TCP Relay-сервер (туннелирование трафика) ─────────────────
	// Слушает на cfg.RelayAddr (по умолчанию :9101).
	// Каждое входящее соединение — отдельная горутина; живёт столько,
	// сколько активен туннель пользователя.
	relay := transport.NewRelayServer(cfg.RelayAddr, store, gate, rulesEngine, cfg.UpstreamProxy)
	go func() {
		if err := relay.Run(ctx); err != nil {
			log.Fatalf("[JOPA] Relay server failed: %v", err)
		}
	}()

	// ── HTTP API ───────────────────────────────────────────────────
	// Слушает на cfg.HTTPAddr (по умолчанию :9109).
	// Блокирующий вызов — если HTTP упал, весь процесс падает.
	apiSrv := api.New(cfg, store, gate)
	log.Printf("[JOPA] API listening on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, apiSrv.Handler()); err != nil {
		log.Fatalf("[JOPA] API failed: %v", err)
	}
}
