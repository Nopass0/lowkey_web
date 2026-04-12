// jopad — JOPA VPN server daemon with Lowkey subscription validation.
// Validates VPN tokens via VoidDB (direct) or backend API, reports stats,
// applies per-user and global traffic rules fetched from backend.
package main

import (
	"context"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/lowkey/jopa-server/pkg/jopa"
)

func main() {
	pskHex := getEnv("JOPA_PSK", "4a6f706150534b546573744b657932303234000000000000000000000000000000")
	privHex := getEnv("JOPA_PRIV", "4a6f70615072697654657374000000000000000000000000000000000000000000")
	portStr := getEnv("JOPA_PORT", "0")

	voiddbURL := getEnv("VOIDDB_URL", "https://db.lowkey.su")
	voiddbToken := getEnv("VOIDDB_TOKEN", "")
	backendURL := getEnv("BACKEND_URL", "https://lowkey.su/api")
	backendSecret := getEnv("BACKEND_SECRET", "")
	serverID := getEnv("SERVER_ID", "")
	serverIP := getEnv("SERVER_IP", "")

	var psk [32]byte
	copy(psk[:], keyFromString(pskHex))

	var privKey [32]byte
	copy(privKey[:], keyFromString(privHex))

	var port uint16
	if portStr != "0" {
		var p int
		fmt.Sscanf(portStr, "%d", &p)
		port = uint16(p)
	}

	cfg := jopa.Config{
		PSK:        psk,
		PrivateKey: privKey,
		ListenHost: "0.0.0.0",
		Port:       port,
		RatchetSec: 60,
	}

	hooks := NewVoidDBHooks(VoidDBHooksConfig{
		VoidDBURL:     voiddbURL,
		VoidDBToken:   voiddbToken,
		BackendURL:    backendURL,
		BackendSecret: backendSecret,
		ServerID:      serverID,
		ServerIP:      serverIP,
	})

	// Refresh rules every 30 seconds
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for range t.C {
			if err := hooks.RefreshRules(context.Background()); err != nil {
				slog.Warn("rules refresh failed", "err", err)
			}
		}
	}()

	// Flush domain stats to backend every 60 seconds
	go func() {
		t := time.NewTicker(60 * time.Second)
		defer t.Stop()
		for range t.C {
			if err := hooks.FlushStats(context.Background()); err != nil {
				slog.Warn("stats flush failed", "err", err)
			}
		}
	}()

	// Register with backend on startup
	go func() {
		time.Sleep(2 * time.Second)
		if err := hooks.RegisterServer(context.Background(), port); err != nil {
			slog.Warn("server registration failed", "err", err)
		}
	}()

	// Heartbeat every 30 seconds
	go func() {
		time.Sleep(5 * time.Second)
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for range t.C {
			if err := hooks.SendHeartbeat(context.Background()); err != nil {
				slog.Warn("heartbeat failed", "err", err)
			}
		}
	}()

	srv := jopa.NewServer(cfg, hooks)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		slog.Info("shutting down...")
		cancel()
		time.Sleep(500 * time.Millisecond)
		os.Exit(0)
	}()

	slog.Info("Starting JOPA server",
		"port", port,
		"voiddb", voiddbURL,
		"backend", backendURL,
	)

	if err := srv.Start(ctx); err != nil && err != context.Canceled {
		slog.Error("server error", "err", err)
		os.Exit(1)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// keyFromString converts a hex string or raw string into 32 bytes.
// If s is a valid 64-char hex string, decode it. Otherwise pad/truncate raw bytes to 32.
func keyFromString(s string) []byte {
	if len(s) == 64 {
		b, err := hex.DecodeString(s)
		if err == nil {
			return b
		}
	}
	out := make([]byte, 32)
	copy(out, []byte(s))
	return out
}
