package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"
)

type Logger struct {
	file *os.File
	mu   sync.Mutex
}

func New(path string) (*Logger, error) {
	l := &Logger{}
	if path == "" {
		return l, nil
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open audit log %s: %w", path, err)
	}
	l.file = f
	return l, nil
}

func (l *Logger) Close() error {
	if l.file == nil {
		return nil
	}
	return l.file.Close()
}

func (l *Logger) Event(event string, attrs ...slog.Attr) {
	all := append([]slog.Attr{slog.String("audit_event", event)}, attrs...)
	slog.LogAttrs(context.Background(), slog.LevelInfo, "security_audit", all...)

	if l.file == nil {
		return
	}

	rec := map[string]string{
		"ts":          time.Now().UTC().Format(time.RFC3339Nano),
		"audit_event": event,
	}
	for _, a := range attrs {
		rec[a.Key] = a.Value.String()
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	enc := json.NewEncoder(l.file)
	_ = enc.Encode(rec)
}

func UserID(id string) slog.Attr       { return slog.String("user_id", id) }
func UserRole(role string) slog.Attr   { return slog.String("user_role", role) }
func ClientIP(ip string) slog.Attr     { return slog.String("client_ip", ip) }
func Resource(res string) slog.Attr    { return slog.String("resource", res) }
func Outcome(out string) slog.Attr     { return slog.String("outcome", out) }
func Detail(key, val string) slog.Attr { return slog.String(key, val) }
