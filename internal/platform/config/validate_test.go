package config_test

import (
	"testing"

	"github.com/eyeeyeai/pilot/internal/platform/config"
)

func TestValidateAllowsDevDefaults(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	cfg := config.Config{
		JWTSecret:         config.DefaultJWTSecret,
		SeedAdminPassword: config.DefaultSeedPassword,
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("dev config should pass: %v", err)
	}
}

func TestValidateRejectsWeakSecretsInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	cfg := config.Config{
		JWTSecret:         config.DefaultJWTSecret,
		SeedAdminPassword: config.DefaultSeedPassword,
	}
	if err := cfg.Validate(); err == nil {
		t.Fatal("expected validation error in production")
	}
}

func TestValidateAcceptsStrongProductionSecrets(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	cfg := config.Config{
		JWTSecret:          "this-is-a-very-long-production-jwt-secret-key",
		SeedAdminPassword:  "UniquePilotPassword!2026",
		SeedDoctorPassword: "UniqueDoctorPassword!2026",
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("strong production config should pass: %v", err)
	}
}
