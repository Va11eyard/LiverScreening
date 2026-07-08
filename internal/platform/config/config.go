package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultSeedDoctorPassword = "Doctor123!"
)

type Config struct {
	ListenHost           string
	Port                 string
	DatabaseURL          string
	JWTSecret            string
	CORSAllowedOrigins   []string
	AccessTokenTTL       time.Duration
	RefreshTokenTTL      time.Duration
	SeedAdminEmail       string
	SeedAdminPassword    string
	SeedDoctorPassword   string
	SeedDoctorPasswordsFile string
	SeedRotatePasswords  bool
	UploadDir            string
	AIInferenceURL       string
	AIInferenceAPIKey    string
	AIInferenceTimeout   time.Duration
	TrustedProxyIPs      []string
	APIRateLimitMax      int
	APIRateLimitWindow   time.Duration
	RefreshRateLimitMax  int
	ExcelExportEnabled   bool
	ExcelExportCron      string
	ExcelExportDir       string
	AuditLogPath         string
}

func Load() Config {
	origins := strings.Split(os.Getenv("CORS_ALLOWED_ORIGINS"), ",")
	if len(origins) == 1 && origins[0] == "" {
		origins = []string{"http://localhost:3004"}
	}
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}

	proxyIPs := strings.Split(envOr("TRUSTED_PROXY_IPS", "127.0.0.1,::1"), ",")
	for i := range proxyIPs {
		proxyIPs[i] = strings.TrimSpace(proxyIPs[i])
	}

	return Config{
		ListenHost:         listenHost(),
		Port:               envOr("PORT", "8080"),
		DatabaseURL:        envOr("DATABASE_URL", "postgres://eyeeye:eyeeye@localhost:5434/eyeeye?sslmode=disable"),
		JWTSecret:          envOr("JWT_SECRET", "dev-change-me-in-production"),
		CORSAllowedOrigins: origins,
		AccessTokenTTL:     durationEnvOr("ACCESS_TOKEN_TTL", 15*time.Minute),
		RefreshTokenTTL:    durationEnvOr("REFRESH_TOKEN_TTL", 7*24*time.Hour),
		SeedAdminEmail:     envOr("SEED_ADMIN_EMAIL", "coordinator@eyeeye.kz"),
		SeedAdminPassword:  envOr("SEED_ADMIN_PASSWORD", "ChangeMe123!"),
		SeedDoctorPassword:  envOr("SEED_DOCTOR_PASSWORD", DefaultSeedDoctorPassword),
		SeedDoctorPasswordsFile: os.Getenv("SEED_DOCTOR_PASSWORDS_FILE"),
		SeedRotatePasswords: os.Getenv("SEED_ROTATE_PASSWORDS") == "1",
		UploadDir:           envOr("UPLOAD_DIR", "./uploads"),
		AIInferenceURL:     os.Getenv("AI_INFERENCE_URL"),
		AIInferenceAPIKey:  os.Getenv("AI_INFERENCE_API_KEY"),
		AIInferenceTimeout: durationEnvOr("AI_INFERENCE_TIMEOUT", 60*time.Second),
		TrustedProxyIPs:    proxyIPs,
		APIRateLimitMax:    intEnvOr("API_RATE_LIMIT_MAX", 120),
		APIRateLimitWindow: durationEnvOr("API_RATE_LIMIT_WINDOW", time.Minute),
		RefreshRateLimitMax: intEnvOr("REFRESH_RATE_LIMIT_MAX", 20),
		ExcelExportEnabled:  os.Getenv("EXCEL_EXPORT_ENABLED") == "true",
		ExcelExportCron:     envOr("EXCEL_EXPORT_CRON", "0 8 * * 1"),
		ExcelExportDir:      envOr("EXCEL_EXPORT_DIR", "./exports/weekly"),
		AuditLogPath:        auditLogPath(),
	}
}

func auditLogPath() string {
	if v := os.Getenv("AUDIT_LOG_PATH"); v != "" {
		return v
	}
	if IsProduction() {
		return "/var/log/eyeeye/audit.jsonl"
	}
	return ""
}

func listenHost() string {
	if v := os.Getenv("LISTEN_HOST"); v != "" {
		return v
	}
	if IsProduction() {
		return "127.0.0.1"
	}
	return ""
}

func durationEnvOr(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}

func intEnvOr(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
