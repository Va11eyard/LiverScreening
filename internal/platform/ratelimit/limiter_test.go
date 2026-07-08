package ratelimit_test

import (
	"testing"
	"time"

	"github.com/eyeeyeai/pilot/internal/platform/ratelimit"
)

func TestIPLimiterBlocksAfterMaxAttempts(t *testing.T) {
	l := ratelimit.NewIPLimiter(3, time.Minute)
	ip := "203.0.113.1"
	for i := 0; i < 3; i++ {
		if l.TooMany(ip) {
			t.Fatalf("unexpected block on attempt %d", i+1)
		}
		l.Record(ip)
	}
	if !l.TooMany(ip) {
		t.Fatal("expected rate limit after max failures")
	}
}

func TestIPLimiterResetClearsAttempts(t *testing.T) {
	l := ratelimit.NewIPLimiter(1, time.Minute)
	ip := "203.0.113.2"
	l.Record(ip)
	if !l.TooMany(ip) {
		t.Fatal("expected block")
	}
	l.Reset(ip)
	if l.TooMany(ip) {
		t.Fatal("expected allow after reset")
	}
}
