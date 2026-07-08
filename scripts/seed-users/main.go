package main

import (
	"fmt"
	"log"
	"os"

	"github.com/eyeeyeai/pilot/internal/domain"
	"github.com/eyeeyeai/pilot/internal/platform/config"
	"github.com/eyeeyeai/pilot/internal/platform/password"
	"github.com/eyeeyeai/pilot/internal/platform/seed"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

func main() {
	cfg := config.Load()

	doctorPasswords, err := seed.LoadDoctorPasswords(cfg.SeedDoctorPasswordsFile)
	if err != nil {
		log.Fatalf("load doctor passwords: %v", err)
	}

	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("open db: %v", err)
	}

	updateCols := []string{"name", "role", "hospital", "updated_at"}
	if cfg.SeedRotatePasswords {
		updateCols = append(updateCols, "password_hash")
	}

	for _, su := range seed.UserSpecs(cfg, doctorPasswords) {
		hash := ""
		if cfg.SeedRotatePasswords || su.Password != "" {
			var err error
			hash, err = password.Hash(su.Password)
			if err != nil {
				log.Fatalf("hash password for %s: %v", su.Email, err)
			}
		}

		u := domain.User{
			ID:           uuid.New(),
			Email:        su.Email,
			PasswordHash: hash,
			Name:         su.Name,
			Role:         su.Role,
			Hospital:     su.Hospital,
		}

		result := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "email"}},
			DoUpdates: clause.AssignmentColumns(updateCols),
		}).Create(&u)

		if result.Error != nil {
			log.Fatalf("upsert %s: %v", su.Email, result.Error)
		}
		fmt.Printf("ok %s (%s) %s\n", su.Email, su.Role, su.Hospital)
	}

	fmt.Println("done")
	os.Exit(0)
}
