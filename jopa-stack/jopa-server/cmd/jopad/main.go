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
	"context"
	"log"
	"net/http"
	"time"

	"jopa-stack/jopa-server/internal/api"
	"jopa-stack/jopa-server/internal/config"
	"jopa-stack/jopa-server/internal/device"
	"jopa-stack/jopa-server/internal/storage"
	"jopa-stack/jopa-server/internal/subscription"
	"jopa-stack/jopa-server/internal/transport"
)

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
	relay := transport.NewRelayServer(cfg.RelayAddr, store, gate)
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
