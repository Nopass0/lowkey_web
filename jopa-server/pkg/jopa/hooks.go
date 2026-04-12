package jopa

import "context"

// ClientInfo contains device metadata supplied by client during handshake.
type ClientInfo struct {
	Token     string `json:"token"`
	DeviceID  string `json:"device_id"`
	Platform  string `json:"platform"`
	OSVersion string `json:"os_version"`
	Model     string `json:"model"`
	CPUArch   string `json:"cpu_arch"`
	CPUCores  int    `json:"cpu_cores"`
	RAMGB     int    `json:"ram_gb"`
	ScreenRes string `json:"screen_res"`
	ClientVer string `json:"client_ver"`
}

// AccessResult is returned by CheckAccess hook.
type AccessResult struct {
	Allowed      bool
	RejectSilent bool
	RedirectURL  string
	SpeedLimit   int
	Message      string
	Metadata     map[string]string
}

// FlowInfo describes traffic unit evaluated by policy engine.
type FlowInfo struct {
	SessionID string
	DeviceID  string
	Token     string
	Domain    string
	DestIP    string
	DestPort  uint16
	Protocol  string
	BytesUp   uint64
	BytesDown uint64
	StartedAt int64
}

// TrafficAction tells transport layer how to handle matched traffic.
type TrafficAction struct {
	Allow        bool
	Block        bool
	RedirectURL  string
	SpeedLimit   int
	DNSOverride  string
	Rule         string
	RedirectHost string
	RedirectPort uint16
	RewriteUp    []RewriteRule
	RewriteDown  []RewriteRule
	Reason       string
	MaxPayload   int
	Window       int
	AckTimeoutMs int
	MaxRetries   int
}

// RewriteRule is simple text substitution rule used in modify policies.
type RewriteRule struct {
	Find    string
	Replace string
}

// Hooks defines integration contract between JOPA core and policy/business logic.
type Hooks interface {
	CheckAccess(ctx context.Context, info ClientInfo) AccessResult
	OnConnect(ctx context.Context, info ClientInfo)
	OnDisconnect(ctx context.Context, sessionID string, deviceID string)
	OnTraffic(ctx context.Context, flow FlowInfo) TrafficAction
	OnFlowComplete(ctx context.Context, flow FlowInfo)
}

// DefaultHooks is a permissive no-op implementation for development.
type DefaultHooks struct{}

func (DefaultHooks) CheckAccess(_ context.Context, _ ClientInfo) AccessResult {
	return AccessResult{Allowed: true}
}
func (DefaultHooks) OnConnect(_ context.Context, _ ClientInfo)   {}
func (DefaultHooks) OnDisconnect(_ context.Context, _, _ string) {}
func (DefaultHooks) OnTraffic(_ context.Context, _ FlowInfo) TrafficAction {
	return TrafficAction{Allow: true}
}
func (DefaultHooks) OnFlowComplete(_ context.Context, _ FlowInfo) {}
