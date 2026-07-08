package main

import (
	"log/slog"
	"os"
	"time"

	apihttp "github.com/eyeeyeai/pilot/internal/delivery/http"
	"github.com/eyeeyeai/pilot/internal/platform/ai"
	"github.com/eyeeyeai/pilot/internal/platform/audit"
	"github.com/eyeeyeai/pilot/internal/platform/config"
	"github.com/eyeeyeai/pilot/internal/platform/ratelimit"
	"github.com/eyeeyeai/pilot/internal/platform/storage"
	"github.com/eyeeyeai/pilot/internal/repository/postgres"
	"github.com/eyeeyeai/pilot/internal/usecase"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	store, err := postgres.NewStore(cfg)
	if err != nil {
		slog.Error("db init failed", "error", err)
		os.Exit(1)
	}

	fileStore, err := storage.New(cfg.UploadDir)
	if err != nil {
		slog.Error("upload dir init failed", "error", err)
		os.Exit(1)
	}

	aiClient, err := ai.NewClient(cfg.AIInferenceURL, cfg.AIInferenceAPIKey, cfg.AIInferenceTimeout)
	if err != nil {
		slog.Error("ai client init failed", "error", err)
		os.Exit(1)
	}
	svc := usecase.New(store, cfg, fileStore, aiClient)
	auditLog, err := audit.New(cfg.AuditLogPath)
	if err != nil {
		slog.Error("audit log init failed", "error", err)
		os.Exit(1)
	}
	defer auditLog.Close()

	loginLimiter := ratelimit.NewIPLimiter(10, 15*time.Minute)
	refreshLimiter := ratelimit.NewIPLimiter(cfg.RefreshRateLimitMax, 15*time.Minute)
	apiLimiter := ratelimit.NewIPLimiter(cfg.APIRateLimitMax, cfg.APIRateLimitWindow)
	handler := apihttp.NewHandler(svc, auditLog, loginLimiter, refreshLimiter, apiLimiter, cfg)

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.MaxMultipartMemory = 8 << 20
	r.Use(gin.Recovery())
	r.Use(gin.LoggerWithFormatter(func(p gin.LogFormatterParams) string {
		return p.TimeStamp.Format(time.RFC3339) + " " + p.Method + " " + p.Path + " " + p.Latency.String() + "\n"
	}))
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSAllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Disposition", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	handler.Register(r)
	startExcelExportCron(svc, auditLog, cfg)
	addr := cfg.Port
	if cfg.ListenHost != "" {
		addr = cfg.ListenHost + ":" + cfg.Port
	} else {
		addr = ":" + cfg.Port
	}
	slog.Info("api listening", "addr", addr)
	if err := r.Run(addr); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
