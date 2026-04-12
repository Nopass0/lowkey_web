package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/lowkey/jopa-server/pkg/jopa"
)

// VoidDBHooksConfig holds server configuration for the VoidDB hooks implementation.
type VoidDBHooksConfig struct {
	VoidDBURL     string
	VoidDBToken   string
	BackendURL    string
	BackendSecret string
	ServerID      string
	ServerIP      string
}

// domainHit tracks a domain visit with bytes.
type domainHit struct {
	UserID    string
	Domain    string
	Bytes     uint64
	Protocol  string
	Port      uint16
	RemoteIP  string
}

// clientRule is a traffic rule fetched from backend for JOPA sessions.
type clientRule struct {
	Name     string `json:"name"`
	Domain   string `json:"domain"`
	Action   string `json:"action"` // allow, block, redirect
	Redirect string `json:"redirect"`
	UserID   string `json:"userId"` // empty = global
	Enabled  bool   `json:"enabled"`
}

// VoidDBHooks implements jopa.Hooks with Lowkey subscription validation.
type VoidDBHooks struct {
	cfg        VoidDBHooksConfig
	httpClient *http.Client

	// In-memory domain stats accumulator
	statsMu  sync.Mutex
	statsMap map[string]*domainStat // key: userId:domain

	// Traffic rules fetched from backend
	rulesMu sync.RWMutex
	rules   []clientRule

	// Active session tracking
	sessionsMu     sync.RWMutex
	sessions       map[string]sessionMeta // sessionID -> meta
	activeCount    atomic.Int64

	serverID string
}

type domainStat struct {
	UserID   string
	Domain   string
	Visits   int64
	Bytes    uint64
	Protocol string
	Port     uint16
	RemoteIP string
}

type sessionMeta struct {
	UserID   string
	DeviceID string
	Token    string
}

// NewVoidDBHooks creates a new VoidDBHooks instance.
func NewVoidDBHooks(cfg VoidDBHooksConfig) *VoidDBHooks {
	h := &VoidDBHooks{
		cfg:      cfg,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		statsMap: make(map[string]*domainStat),
		sessions: make(map[string]sessionMeta),
		serverID: cfg.ServerID,
	}
	return h
}

// CheckAccess validates token against VoidDB subscription.
func (h *VoidDBHooks) CheckAccess(ctx context.Context, info jopa.ClientInfo) jopa.AccessResult {
	token := info.Token
	if token == "" {
		return jopa.AccessResult{Allowed: false, Message: "no token"}
	}

	// Try backend validate-token first (faster, has full context)
	if result, ok := h.validateViaBackend(ctx, token, info.DeviceID); ok {
		if !result.Valid {
			if result.SubscriptionExpired {
				return jopa.AccessResult{
					Allowed:     false,
					RedirectURL: "https://lowkey.su/me/billing",
					Message:     "subscription expired",
				}
			}
			return jopa.AccessResult{Allowed: false, Message: result.Reason}
		}
		return jopa.AccessResult{Allowed: true}
	}

	// Fallback: direct VoidDB check
	return h.validateViaVoidDB(ctx, token)
}

// OnConnect logs and tracks session.
func (h *VoidDBHooks) OnConnect(ctx context.Context, info jopa.ClientInfo) {
	h.sessionsMu.Lock()
	defer h.sessionsMu.Unlock()

	slog.Info("[JOPA CONNECT]",
		"token", maskToken(info.Token),
		"platform", info.Platform,
		"device_id", info.DeviceID,
	)
	h.activeCount.Add(1)
}

// OnDisconnect cleans up session tracking.
func (h *VoidDBHooks) OnDisconnect(ctx context.Context, sessionID, deviceID string) {
	h.sessionsMu.Lock()
	delete(h.sessions, sessionID)
	h.sessionsMu.Unlock()
	h.activeCount.Add(-1)
	slog.Info("[JOPA DISCONNECT]", "session", sessionID, "device", deviceID)
}

// OnTraffic applies traffic rules and records domain stats.
func (h *VoidDBHooks) OnTraffic(ctx context.Context, flow jopa.FlowInfo) jopa.TrafficAction {
	domain := flow.Domain
	if domain == "" {
		domain = flow.DestIP
	}

	h.rulesMu.RLock()
	rules := h.rules
	h.rulesMu.RUnlock()

	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		// Match: global rule or user-specific
		if rule.UserID != "" && rule.UserID != flow.Token {
			continue
		}
		if rule.Domain != "" && !domainMatch(rule.Domain, domain) {
			continue
		}
		switch rule.Action {
		case "block":
			slog.Debug("[JOPA BLOCK]", "domain", domain, "rule", rule.Name)
			return jopa.TrafficAction{Block: true, Reason: "blocked by rule: " + rule.Name}
		case "redirect":
			if rule.Redirect != "" {
				slog.Debug("[JOPA REDIRECT]", "domain", domain, "to", rule.Redirect, "rule", rule.Name)
				return jopa.TrafficAction{Allow: true, RedirectURL: rule.Redirect}
			}
		}
	}

	return jopa.TrafficAction{Allow: true}
}

// OnFlowComplete records domain stats for flush.
func (h *VoidDBHooks) OnFlowComplete(ctx context.Context, flow jopa.FlowInfo) {
	domain := flow.Domain
	if domain == "" || isPrivateDomain(domain) {
		return
	}
	// Strip port from domain
	if host, _, err := net.SplitHostPort(domain); err == nil {
		domain = host
	}

	h.statsMu.Lock()
	key := flow.Token + ":" + domain
	stat, ok := h.statsMap[key]
	if !ok {
		stat = &domainStat{
			UserID:   flow.Token, // will be resolved to userID when flushing
			Domain:   domain,
			Protocol: "jopa",
			Port:     flow.DestPort,
			RemoteIP: flow.DestIP,
		}
		h.statsMap[key] = stat
	}
	stat.Visits++
	stat.Bytes += flow.BytesUp + flow.BytesDown
	h.statsMu.Unlock()
}

// FlushStats sends accumulated domain stats to the backend.
func (h *VoidDBHooks) FlushStats(ctx context.Context) error {
	h.statsMu.Lock()
	if len(h.statsMap) == 0 {
		h.statsMu.Unlock()
		return nil
	}
	entries := make([]map[string]interface{}, 0, len(h.statsMap))
	for _, stat := range h.statsMap {
		entries = append(entries, map[string]interface{}{
			"token":    stat.UserID,
			"domain":   stat.Domain,
			"visits":   stat.Visits,
			"bytes":    stat.Bytes,
			"protocol": stat.Protocol,
			"port":     stat.Port,
		})
	}
	h.statsMap = make(map[string]*domainStat)
	h.statsMu.Unlock()

	if h.cfg.BackendURL == "" {
		return nil
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"serverID": h.serverID,
		"entries":  entries,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", h.cfg.BackendURL+"/servers/report-domains", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Secret", h.cfg.BackendSecret)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// RefreshRules fetches current traffic rules from backend.
func (h *VoidDBHooks) RefreshRules(ctx context.Context) error {
	if h.cfg.BackendURL == "" {
		return nil
	}

	req, err := http.NewRequestWithContext(ctx, "GET", h.cfg.BackendURL+"/servers/client-rules", nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Server-Secret", h.cfg.BackendSecret)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("rules fetch: status %d", resp.StatusCode)
	}

	data, _ := io.ReadAll(resp.Body)
	var result struct {
		Rules []clientRule `json:"rules"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return err
	}

	h.rulesMu.Lock()
	h.rules = result.Rules
	h.rulesMu.Unlock()

	slog.Info("rules refreshed", "count", len(result.Rules))
	return nil
}

// RegisterServer announces this server to the backend.
func (h *VoidDBHooks) RegisterServer(ctx context.Context, port uint16) error {
	if h.cfg.BackendURL == "" {
		return nil
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"ip":                 h.cfg.ServerIP,
		"port":               port,
		"serverType":         "jopa",
		"supportedProtocols": []string{"jopa"},
		"currentLoad":        0,
		"activeConnections":  0,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", h.cfg.BackendURL+"/servers/register", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Secret", h.cfg.BackendSecret)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	var result struct {
		ServerID string `json:"serverId"`
	}
	if err := json.Unmarshal(data, &result); err == nil && result.ServerID != "" {
		h.serverID = result.ServerID
		slog.Info("registered with backend", "server_id", h.serverID)
	}
	return nil
}

// SendHeartbeat sends a keepalive to the backend.
func (h *VoidDBHooks) SendHeartbeat(ctx context.Context) error {
	if h.cfg.BackendURL == "" || h.serverID == "" {
		return nil
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"serverID":          h.serverID,
		"currentLoad":       0,
		"activeConnections": h.activeCount.Load(),
	})

	req, err := http.NewRequestWithContext(ctx, "POST", h.cfg.BackendURL+"/servers/heartbeat", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Secret", h.cfg.BackendSecret)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

type backendTokenResult struct {
	Valid               bool   `json:"valid"`
	UserID              string `json:"userId"`
	DeviceID            string `json:"deviceId"`
	SubscriptionExpired bool   `json:"subscriptionExpired"`
	Reason              string `json:"reason"`
}

func (h *VoidDBHooks) validateViaBackend(ctx context.Context, token, deviceID string) (backendTokenResult, bool) {
	if h.cfg.BackendURL == "" {
		return backendTokenResult{}, false
	}

	payload, _ := json.Marshal(map[string]string{
		"token":    token,
		"deviceId": deviceID,
		"protocol": "jopa",
	})

	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, "POST", h.cfg.BackendURL+"/servers/validate-token", bytes.NewReader(payload))
	if err != nil {
		return backendTokenResult{}, false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Secret", h.cfg.BackendSecret)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		slog.Warn("backend token validation failed, trying VoidDB", "err", err)
		return backendTokenResult{}, false
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	var result backendTokenResult
	if err := json.Unmarshal(data, &result); err != nil {
		return backendTokenResult{}, false
	}
	return result, true
}

func (h *VoidDBHooks) validateViaVoidDB(ctx context.Context, token string) jopa.AccessResult {
	if h.cfg.VoidDBURL == "" || h.cfg.VoidDBToken == "" {
		slog.Error("VoidDB not configured, denying access")
		return jopa.AccessResult{Allowed: false, Message: "server misconfigured"}
	}

	// Query vpn_tokens collection
	tokenDoc, err := h.voiddbFindOne(ctx, "lowkey", "vpn_tokens", map[string]interface{}{
		"field": "token",
		"op":    "eq",
		"value": token,
	})
	if err != nil || tokenDoc == nil {
		slog.Debug("token not found in VoidDB", "err", err)
		return jopa.AccessResult{Allowed: false, Message: "invalid token"}
	}

	// Check expiry
	expiresAtRaw, _ := tokenDoc["expiresAt"].(string)
	if expiresAtRaw != "" {
		if exp, err := time.Parse(time.RFC3339, expiresAtRaw); err == nil {
			if time.Now().After(exp) {
				return jopa.AccessResult{Allowed: false, Message: "token expired"}
			}
		}
	}

	userID, _ := tokenDoc["userId"].(string)
	if userID == "" {
		return jopa.AccessResult{Allowed: false, Message: "token has no user"}
	}

	// Check user
	userDoc, err := h.voiddbGet(ctx, "lowkey", "users", userID)
	if err != nil || userDoc == nil {
		return jopa.AccessResult{Allowed: false, Message: "user not found"}
	}
	if isBanned, _ := userDoc["isBanned"].(bool); isBanned {
		return jopa.AccessResult{Allowed: false, Message: "account banned"}
	}

	// Check subscription
	subDoc, err := h.voiddbFindOne(ctx, "lowkey", "subscriptions", map[string]interface{}{
		"field": "userId",
		"op":    "eq",
		"value": userID,
	})
	if err != nil || subDoc == nil {
		// No subscription — deny or allow based on anti-TSPU
		slog.Debug("no subscription found, denying", "userId", userID)
		return jopa.AccessResult{Allowed: false, Message: "no active subscription"}
	}

	// Check isLifetime or activeUntil
	if isLifetime, _ := subDoc["isLifetime"].(bool); isLifetime {
		return jopa.AccessResult{Allowed: true}
	}

	activeUntilRaw, _ := subDoc["activeUntil"].(string)
	if activeUntilRaw == "" {
		return jopa.AccessResult{Allowed: false, Message: "subscription invalid"}
	}
	activeUntil, err := time.Parse(time.RFC3339, activeUntilRaw)
	if err != nil {
		return jopa.AccessResult{Allowed: false, Message: "subscription invalid"}
	}
	if time.Now().After(activeUntil) {
		return jopa.AccessResult{
			Allowed:     false,
			RedirectURL: "https://lowkey.su/me/billing",
			Message:     "subscription expired",
		}
	}

	return jopa.AccessResult{Allowed: true}
}

func (h *VoidDBHooks) voiddbFindOne(ctx context.Context, db, collection string, where map[string]interface{}) (map[string]interface{}, error) {
	query := map[string]interface{}{
		"where": where,
		"limit": 1,
	}
	data, _ := json.Marshal(query)

	url := fmt.Sprintf("%s/v1/databases/%s/%s/query", h.cfg.VoidDBURL, db, collection)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+h.cfg.VoidDBToken)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Results []map[string]interface{} `json:"results"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	if len(result.Results) == 0 {
		return nil, nil
	}
	return result.Results[0], nil
}

func (h *VoidDBHooks) voiddbGet(ctx context.Context, db, collection, id string) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/v1/databases/%s/%s/%s", h.cfg.VoidDBURL, db, collection, id)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+h.cfg.VoidDBToken)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return nil, nil
	}

	body, _ := io.ReadAll(resp.Body)
	var doc map[string]interface{}
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, err
	}
	return doc, nil
}

func maskToken(token string) string {
	if len(token) <= 8 {
		return "***"
	}
	return token[:4] + "..." + token[len(token)-4:]
}

func isPrivateDomain(domain string) bool {
	lower := strings.ToLower(domain)
	if lower == "localhost" || strings.HasSuffix(lower, ".local") {
		return true
	}
	ip := net.ParseIP(domain)
	if ip == nil {
		return false
	}
	private := []string{
		"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8",
	}
	for _, cidr := range private {
		_, network, _ := net.ParseCIDR(cidr)
		if network != nil && network.Contains(ip) {
			return true
		}
	}
	return false
}

func domainMatch(pattern, host string) bool {
	pattern = strings.ToLower(strings.TrimSpace(pattern))
	host = strings.ToLower(strings.TrimSpace(host))
	if pattern == "" {
		return true
	}
	if strings.HasPrefix(pattern, "*.") {
		suffix := strings.TrimPrefix(pattern, "*.")
		return host == suffix || strings.HasSuffix(host, "."+suffix)
	}
	return host == pattern
}
