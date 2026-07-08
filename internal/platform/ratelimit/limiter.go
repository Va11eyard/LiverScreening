package ratelimit

import (
	"sync"
	"time"
)

type IPLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
	max      int
	window   time.Duration
}

func (l *IPLimiter) Max() int           { return l.max }
func (l *IPLimiter) Window() time.Duration { return l.window }

func (l *IPLimiter) Remaining(key string) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	used := len(l.prune(key, time.Now()))
	if used >= l.max {
		return 0
	}
	return l.max - used
}

func NewIPLimiter(max int, window time.Duration) *IPLimiter {
	return &IPLimiter{
		attempts: make(map[string][]time.Time),
		max:      max,
		window:   window,
	}
}

func (l *IPLimiter) TooMany(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.prune(key, time.Now())) >= l.max
}

func (l *IPLimiter) Record(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	times := append(l.prune(key, now), now)
	l.attempts[key] = times
}

func (l *IPLimiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}

func (l *IPLimiter) prune(key string, now time.Time) []time.Time {
	cutoff := now.Add(-l.window)
	times := l.attempts[key]
	valid := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	l.attempts[key] = valid
	return valid
}
