package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/eyeeyeai/pilot/internal/platform/audit"
	"github.com/eyeeyeai/pilot/internal/platform/config"
	"github.com/eyeeyeai/pilot/internal/platform/exportarchive"
	"github.com/eyeeyeai/pilot/internal/usecase"
	"github.com/robfig/cron/v3"
)

func startExcelExportCron(svc *usecase.Service, auditLog *audit.Logger, cfg config.Config) {
	if !cfg.ExcelExportEnabled {
		return
	}
	if err := exportarchive.EnsureDir(cfg.ExcelExportDir); err != nil {
		slog.Error("excel export dir init failed", "error", err, "dir", cfg.ExcelExportDir)
		return
	}

	c := cron.New()
	_, err := c.AddFunc(cfg.ExcelExportCron, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		name, err := svc.RunScheduledExcelExport(ctx)
		if err != nil {
			slog.Error("scheduled excel export failed", "error", err)
			auditLog.Event("report.excel.cron", audit.Outcome("failure"), audit.Detail("error", err.Error()))
			return
		}
		slog.Info("scheduled excel export written", "file", name, "dir", cfg.ExcelExportDir)
		auditLog.Event("report.excel.cron", audit.Outcome("success"), audit.Detail("file", name))
	})
	if err != nil {
		slog.Error("excel export cron schedule invalid", "error", err, "spec", cfg.ExcelExportCron)
		return
	}
	c.Start()
	slog.Info("excel export cron started", "spec", cfg.ExcelExportCron, "dir", cfg.ExcelExportDir)
}
