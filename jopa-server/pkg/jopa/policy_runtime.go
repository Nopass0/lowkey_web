package jopa

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"strings"
)

// applyRewriteRules performs a simple ordered find/replace for payload bytes.
// This is intentionally plain-text and is designed for HTTP-like streams.
func applyRewriteRules(payload []byte, rules []RewriteRule) []byte {
	if len(rules) == 0 || len(payload) == 0 {
		return payload
	}
	out := payload
	for _, r := range rules {
		if r.Find == "" {
			continue
		}
		out = []byte(strings.ReplaceAll(string(out), r.Find, r.Replace))
	}
	return out
}

// applyDownstreamRewrite applies rewrite rules to server→client (downstream) data.
// For streaming (non-buffered) mode only. For full-response rewriting use applyFullResponseRewrite.
func applyDownstreamRewrite(payload []byte, rules []RewriteRule) []byte {
	if len(rules) == 0 || len(payload) == 0 {
		return payload
	}
	rewritten := applyRewriteRules(payload, rules)
	if bytes.Equal(rewritten, payload) {
		return rewritten
	}
	if !bytes.HasPrefix(rewritten, []byte("HTTP/")) {
		return rewritten
	}
	return fixHTTPResponseHeaders(rewritten)
}

// applyFullResponseRewrite processes a COMPLETE HTTP response with rewrite rules.
// Must be called with the full buffered response, not individual chunks.
//
// Correct order: unchunk first → rewrite → done.
// (Rewriting after unchunking avoids invalidating chunk-size lines embedded in the body.)
func applyFullResponseRewrite(response []byte, rules []RewriteRule) []byte {
	if len(rules) == 0 || len(response) == 0 {
		return response
	}
	// For HTTP responses: unchunk/fix-headers FIRST so rewrites operate on clean body.
	prepared := response
	if bytes.HasPrefix(response, []byte("HTTP/")) {
		// fixHTTPResponseHeaders strips Content-Length, unchunks body, adds Connection: close.
		// We do this unconditionally so Content-Length is always correct after body injection.
		prepared = fixHTTPResponseHeaders(response)
	}
	return applyRewriteRules(prepared, rules)
}

// stripAcceptEncoding replaces the Accept-Encoding header in an HTTP request with
// "identity" (no compression). Called on upstream data when the stream has downstream
// rewrite rules — compressed responses cannot be text-searched for </body>.
func stripAcceptEncoding(data []byte) []byte {
	if len(data) < 4 {
		return data
	}
	prefix := strings.ToUpper(string(data[:min(len(data), 8)]))
	if !strings.HasPrefix(prefix, "GET ") &&
		!strings.HasPrefix(prefix, "POST ") &&
		!strings.HasPrefix(prefix, "HEAD ") &&
		!strings.HasPrefix(prefix, "PUT ") &&
		!strings.HasPrefix(prefix, "DELETE ") &&
		!strings.HasPrefix(prefix, "PATCH ") &&
		!strings.HasPrefix(prefix, "OPTIONS") {
		return data // not an HTTP request
	}
	sep := []byte("\r\n\r\n")
	headerEnd := bytes.Index(data, sep)
	tail := []byte(nil)
	headerBytes := data
	if headerEnd >= 0 {
		tail = data[headerEnd:]
		headerBytes = data[:headerEnd]
	}
	lines := bytes.Split(headerBytes, []byte("\r\n"))
	out := make([][]byte, 0, len(lines))
	hasConnection := false
	for _, line := range lines {
		lower := bytes.ToLower(line)
		if bytes.HasPrefix(lower, []byte("accept-encoding:")) {
			out = append(out, []byte("Accept-Encoding: identity"))
		} else if bytes.HasPrefix(lower, []byte("connection:")) {
			out = append(out, []byte("Connection: close"))
			hasConnection = true
		} else {
			out = append(out, line)
		}
	}
	if !hasConnection {
		out = append(out, []byte("Connection: close"))
	}
	var buf bytes.Buffer
	buf.Write(bytes.Join(out, []byte("\r\n")))
	if tail != nil {
		buf.Write(tail)
	}
	return buf.Bytes()
}

// fixHTTPResponseHeaders removes Content-Length (stale after body rewrite),
// strips Transfer-Encoding: chunked (decodes body inline), and sets
// Connection: close so the client reads until EOF.
func fixHTTPResponseHeaders(response []byte) []byte {
	sep := []byte("\r\n\r\n")
	idx := bytes.Index(response, sep)
	if idx < 0 {
		return response // headers not yet complete in this chunk
	}

	rawHeaders := response[:idx]
	rawBody := response[idx+4:]

	lines := bytes.Split(rawHeaders, []byte("\r\n"))
	out := make([][]byte, 0, len(lines))
	isChunked := false
	hasConnection := false

	for _, line := range lines {
		lower := bytes.ToLower(line)
		switch {
		case bytes.HasPrefix(lower, []byte("content-length:")):
			continue // drop — body length changed
		case bytes.HasPrefix(lower, []byte("transfer-encoding:")):
			if bytes.Contains(lower, []byte("chunked")) {
				isChunked = true
			}
			continue // drop — we unchunk inline
		case bytes.HasPrefix(lower, []byte("connection:")):
			out = append(out, []byte("Connection: close"))
			hasConnection = true
		default:
			out = append(out, line)
		}
	}
	if !hasConnection {
		out = append(out, []byte("Connection: close"))
	}

	body := rawBody
	if isChunked {
		body = unchunkHTTPBody(rawBody)
	}

	var buf bytes.Buffer
	buf.Write(bytes.Join(out, []byte("\r\n")))
	buf.Write(sep)
	buf.Write(body)
	return buf.Bytes()
}

// unchunkHTTPBody decodes HTTP/1.1 chunked transfer encoding into a flat body.
func unchunkHTTPBody(chunked []byte) []byte {
	var body []byte
	data := chunked
	for len(data) > 0 {
		crlf := bytes.Index(data, []byte("\r\n"))
		if crlf < 0 {
			body = append(body, data...)
			break
		}
		sizeLine := strings.TrimSpace(string(data[:crlf]))
		if semi := strings.IndexByte(sizeLine, ';'); semi >= 0 {
			sizeLine = sizeLine[:semi] // strip chunk extensions
		}
		var size int
		if _, err := fmt.Sscanf(sizeLine, "%x", &size); err != nil || size <= 0 {
			break // 0 = last chunk, invalid = stop
		}
		data = data[crlf+2:]
		if len(data) < size {
			body = append(body, data...)
			break
		}
		body = append(body, data[:size]...)
		data = data[size:]
		if len(data) >= 2 && data[0] == '\r' && data[1] == '\n' {
			data = data[2:]
		}
	}
	return body
}

func applyHostPortRedirect(host string, port uint16, action TrafficAction) (string, uint16) {
	if action.DNSOverride != "" {
		host = action.DNSOverride
	}
	if action.RedirectHost != "" {
		host = action.RedirectHost
	}
	if action.RedirectPort != 0 {
		port = action.RedirectPort
	}
	if action.RedirectURL != "" {
		if h, p, ok := parseRedirectTarget(action.RedirectURL, port); ok {
			return h, p
		}
	}
	return host, port
}

func applyPacketRedirect(dstIP net.IP, dstPort uint16, action TrafficAction) (net.IP, uint16) {
	if action.DNSOverride != "" {
		if ip := net.ParseIP(action.DNSOverride).To4(); ip != nil {
			dstIP = ip
		}
	}
	if action.RedirectHost != "" {
		if ip := net.ParseIP(action.RedirectHost).To4(); ip != nil {
			dstIP = ip
		}
	}
	if action.RedirectPort != 0 {
		dstPort = action.RedirectPort
	}
	if action.RedirectURL != "" {
		if h, p, ok := parseRedirectTarget(action.RedirectURL, dstPort); ok {
			if ip := net.ParseIP(h).To4(); ip != nil {
				dstIP = ip
			}
			dstPort = p
		}
	}
	return dstIP, dstPort
}

func parseRedirectTarget(raw string, fallbackPort uint16) (string, uint16, bool) {
	if raw == "" {
		return "", 0, false
	}
	if strings.Contains(raw, "://") {
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			return "", 0, false
		}
		host := u.Hostname()
		port := fallbackPort
		if p := u.Port(); p != "" {
			var parsed int
			if _, err := fmt.Sscanf(p, "%d", &parsed); err == nil && parsed > 0 && parsed <= 65535 {
				port = uint16(parsed)
			}
		} else if u.Scheme == "https" {
			port = 443
		} else if u.Scheme == "http" {
			port = 80
		}
		return host, port, true
	}
	if h, p, err := net.SplitHostPort(raw); err == nil {
		var parsed int
		if _, err := fmt.Sscanf(p, "%d", &parsed); err == nil && parsed > 0 && parsed <= 65535 {
			return h, uint16(parsed), true
		}
		return h, fallbackPort, true
	}
	return raw, fallbackPort, true
}

// sendPolicyNotice notifies client that server-side policy has affected a stream.
func (s *Server) sendPolicyNotice(sess *Session, streamID uint16, action TrafficAction, target string, port uint16) {
	msg := map[string]any{
		"type":   "policy",
		"stream": streamID,
		"rule":   action.Rule,
		"block":  action.Block,
		"target": fmt.Sprintf("%s:%d", target, port),
	}
	if action.Reason != "" {
		msg["reason"] = action.Reason
	}
	if action.RedirectHost != "" || action.RedirectURL != "" || action.DNSOverride != "" {
		msg["redirect"] = true
	}
	if len(action.RewriteUp) > 0 || len(action.RewriteDown) > 0 {
		msg["modify"] = true
	}
	if action.MaxPayload > 0 {
		msg["max_payload"] = action.MaxPayload
	}
	if action.Window > 0 {
		msg["window"] = action.Window
	}
	if action.AckTimeoutMs > 0 {
		msg["ack_timeout_ms"] = action.AckTimeoutMs
	}
	if action.MaxRetries > 0 {
		msg["max_retries"] = action.MaxRetries
	}
	payload, _ := json.Marshal(msg)
	_ = sess.SendFrame(&Frame{Type: FrameControl, StreamID: streamID, Payload: payload})
}
