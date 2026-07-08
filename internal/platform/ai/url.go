package ai

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
)

var (
	ErrInferenceURLScheme  = errors.New("AI_INFERENCE_URL must use https")
	ErrInferenceURLPrivate = errors.New("AI_INFERENCE_URL must not target private or loopback addresses")
)

var blockedHosts = []string{
	"localhost",
	"metadata.google.internal",
	"metadata.google",
}

func ValidateInferenceURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid AI_INFERENCE_URL: %w", err)
	}
	if u.Scheme != "https" {
		if u.Scheme == "http" && os.Getenv("AI_INFERENCE_ALLOW_HTTP") == "true" {
		} else {
			return ErrInferenceURLScheme
		}
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return fmt.Errorf("invalid AI_INFERENCE_URL host")
	}
	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return ErrInferenceURLPrivate
		}
		return nil
	}
	for _, blocked := range blockedHosts {
		if host == blocked || strings.HasSuffix(host, "."+blocked) {
			return ErrInferenceURLPrivate
		}
	}
	return nil
}

func validateResolvedIPs(host string) error {
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("resolve AI_INFERENCE_URL: %w", err)
	}
	for _, ip := range ips {
		if isBlockedIP(ip) {
			return ErrInferenceURLPrivate
		}
	}
	return nil
}

func isBlockedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	if ip.IsUnspecified() {
		return true
	}
	return false
}
