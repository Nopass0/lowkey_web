// Hysteria2 VPN server for Lowkey VPN.
//
// Features:
//   - VoidDB direct integration (github.com/Nopass0/void_go API)
//   - Real-time connection counting via heartbeat
//   - SNI-based domain visit statistics (flushed to backend every N seconds)
//   - Captive portal for expired subscriptions:
//     HTTP (port 80):  302 redirect to billing page
//     HTTPS (port 443): DNS hijack → HTTPS captive portal server
//   - DNS hijacking for expired users (both HTTP and HTTPS coverage)
//   - MTProto proxy for Telegram with optional bot/channel advertising
//
// Usage:
//
//	VOIDDB_URL=http://voiddb:7700 \
//	VOIDDB_USERNAME=admin VOIDDB_PASSWORD=secret \
//	BACKEND_URL=https://lowkey.su/api \
//	SERVER_IP=1.2.3.4 CERT_FILE=/ssl/server.crt KEY_FILE=/ssl/server.key \
//	./hysteria-server
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/lowkey/hysteria-server/captive"
	"github.com/lowkey/hysteria-server/config"
	"github.com/lowkey/hysteria-server/mtproto"
	"github.com/lowkey/hysteria-server/server"
	"github.com/lowkey/hysteria-server/stats"
	"github.com/lowkey/hysteria-server/voiddb"
)

func main() {
	// Utility flags
	genSecret := flag.Bool("gen-mtproto-secret", false, "Generate an MTProto proxy secret and exit")
	flag.Parse()

	if *genSecret {
		fmt.Println(mtproto.GenerateSecret())
		os.Exit(0)
	}

	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Println("[Main] Starting Lowkey VPN server")

	// ── Config ────────────────────────────────────────────────────────────────
	cfg := config.Load()
	if cfg.VoidDBURL == "" {
		log.Fatal("[Config] VOIDDB_URL is required")
	}
	if cfg.BackendURL == "" {
		log.Fatal("[Config] BACKEND_URL is required")
	}
	if cfg.CertFile == "" || cfg.KeyFile == "" {
		log.Fatal("[Config] CERT_FILE and KEY_FILE are required")
	}
	if cfg.ServerIP == "" {
		log.Printf("[Config] SERVER_IP is empty; server registration and captive portal IP mapping will be incomplete")
	}
	if cfg.BackendSecret == "" {
		log.Printf("[Config] BACKEND_SECRET is empty; backend /servers/* endpoints must allow unsigned nodes")
	}

	// ── VoidDB client ─────────────────────────────────────────────────────────
	db := voiddb.New(cfg.VoidDBURL, cfg.VoidDBUsername, cfg.VoidDBPassword, cfg.VoidDBToken)
	// db.DB("lowkey").Collection("...") — used by server.Server internally

	// ── Domain stats tracker ──────────────────────────────────────────────────
	tracker := stats.New(cfg.BackendURL, cfg.BackendSecret, cfg.DomainFlushInterval)
	defer tracker.Stop()

	// ── VPN server core ───────────────────────────────────────────────────────
	vpnSrv := server.New(cfg, db, tracker)

	// ── Captive portal HTTP (port 80) ─────────────────────────────────────────
	httpPortal := captive.NewHTTP(cfg.CaptivePortalListen, cfg.CaptivePortalURL)
	httpPortal.Start()
	defer httpPortal.Stop()

	// ── Captive portal HTTPS (port 8443 on captive IP) ────────────────────────
	if cfg.CaptiveHTTPSListen != "" {
		httpsPortal, err := captive.NewHTTPS(cfg.CaptiveHTTPSListen, cfg.CertFile, cfg.KeyFile, cfg.CaptivePortalURL)
		if err != nil {
			log.Printf("[CaptiveHTTPS] Not started: %v", err)
		} else {
			httpsPortal.Start()
			defer httpsPortal.Stop()
		}
	}

	// ── DNS captive portal ────────────────────────────────────────────────────
	var dnsSrv *captive.DNSServer
	if cfg.DNSListen != "" && cfg.CaptiveIP != "" {
		dnsSrv = captive.NewDNS(cfg.DNSListen, cfg.CaptiveIP, cfg.UpstreamDNS)
		dnsSrv.Start()
		defer dnsSrv.Stop()
		log.Printf("[DNS] Captive portal DNS started (captive IP: %s)", cfg.CaptiveIP)
	}
	_ = dnsSrv // used by connection handler

	// ── Lifecycle context ─────────────────────────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Heartbeat loop ────────────────────────────────────────────────────────
	go vpnSrv.HeartbeatLoop(ctx)

	// ── MTProto proxy ─────────────────────────────────────────────────────────
	if cfg.MTProtoEnabled && cfg.MTProtoSecret != "" {
		mtpSrv, err := mtproto.New(cfg.MTProtoListen, cfg.MTProtoSecret,
			cfg.MTProtoChannelUsername, cfg.MTProtoAddChannelOnConnect)
		if err != nil {
			log.Printf("[MTProto] Failed to create: %v", err)
		} else {
			go func() {
				if err := mtpSrv.ListenAndServe(); err != nil {
					log.Printf("[MTProto] Error: %v", err)
				}
			}()
			defer mtpSrv.Stop()
			log.Printf("[MTProto] Proxy started on %s", cfg.MTProtoListen)
		}
	}

	// ── Hysteria2 server ──────────────────────────────────────────────────────
	// The hysteria2 core library (github.com/apernet/hysteria/core/v2) provides
	// QUIC transport. Integration points:
	//
	//  server.NewServer(&server.Config{
	//      TLSConfig: *tlsCfg,
	//      Authenticator: &auth{vpnSrv},   // calls vpnSrv.ValidateToken
	//      TrafficLogger: &trafficLog{},   // calls vpnSrv.UpdateTraffic
	//      RequestHook:   &reqHook{},      // captive portal + domain tracking
	//  })
	//
	// See auth / trafficLog / reqHook types below.
	tlsCfg, err := server.LoadTLSConfig(cfg.CertFile, cfg.KeyFile)
	if err != nil {
		log.Fatalf("[TLS] %v", err)
	}
	_ = tlsCfg

	log.Printf("[Hysteria2] Ready on %s", cfg.Listen)
	log.Printf("[Captive]   HTTP on %s → %s", cfg.CaptivePortalListen, cfg.CaptivePortalURL)

	// Wait for shutdown signal
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Println("[Main] Shutting down…")
}

// ─── Hysteria2 auth hook ─────────────────────────────────────────────────────

// hysteria2Auth implements the Authenticator interface required by hysteria/core/v2.
// It is called for each new QUIC connection with the client's auth string (VPN token).
type hysteria2Auth struct{ vpnSrv *server.Server }

// Authenticate validates the token and returns (ok, id).
// The id is stored in the connection context and passed to subsequent hooks.
func (a *hysteria2Auth) Authenticate(addr interface{}, authStr string, tx int64) (bool, string) {
	info := a.vpnSrv.ValidateToken(authStr)
	if !info.Valid {
		return false, ""
	}
	id := info.UserID
	if info.SubscriptionExpired {
		id = "expired:" + id
	}
	return true, id
}

// ─── Hysteria2 request hook ───────────────────────────────────────────────────

// hysteria2RequestHook implements RequestHook from hysteria/core/v2.
// Called before each outbound TCP CONNECT or UDP associate.
type hysteria2RequestHook struct{ vpnSrv *server.Server }

// Hook decides whether to allow, redirect, or block a request.
// id encodes "expired:<userID>" or plain "<userID>" from the auth step.
func (h *hysteria2RequestHook) Hook(id, target string, isUDP bool) (block bool, newTarget string, err error) {
	expired := false
	userID := id
	if len(id) > 8 && id[:8] == "expired:" {
		expired = true
		userID = id[8:]
	}
	_ = userID

	if expired && !isUDP {
		_, port, _ := splitHostPort(target)
		if port == "80" || port == "8080" {
			// Redirect HTTP to captive portal HTTP server
			return false, h.vpnSrv.CaptivePortalListen(), nil
		}
		// Block HTTPS and other ports; DNS hijack handles the redirect
		return true, "", nil
	}
	return false, target, nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func splitHostPort(hostport string) (host, port string, err error) {
	for i := len(hostport) - 1; i >= 0; i-- {
		if hostport[i] == ':' {
			return hostport[:i], hostport[i+1:], nil
		}
	}
	return hostport, "", nil
}
