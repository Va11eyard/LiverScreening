package config

import (
	"errors"
	"os"

	"github.com/eyeeyeai/pilot/internal/platform/ai"
)

const (
	DefaultJWTSecret        = "dev-change-me-in-production"
	DefaultSeedPassword     = "ChangeMe123!"
	minProductionSecret     = 32
)

var (
	ErrWeakJWTSecret         = errors.New("JWT_SECRET must be a strong unique value (min 32 chars) in production")
	ErrWeakSeedPassword      = errors.New("SEED_ADMIN_PASSWORD must not use the default value in production")
	ErrWeakSeedDoctorPassword = errors.New("SEED_DOCTOR_PASSWORD must not use the default value in production")
)

func IsProduction() bool {
	return os.Getenv("APP_ENV") == "production"
}

func (c Config) Validate() error {
	if err := ai.ValidateInferenceURL(c.AIInferenceURL); err != nil {
		return err
	}
	if !IsProduction() {
		return nil
	}
	if c.JWTSecret == DefaultJWTSecret || len(c.JWTSecret) < minProductionSecret {
		return ErrWeakJWTSecret
	}
	if c.SeedAdminPassword == DefaultSeedPassword {
		return ErrWeakSeedPassword
	}
	if c.SeedDoctorPassword == DefaultSeedDoctorPassword {
		return ErrWeakSeedDoctorPassword
	}
	return nil
}
