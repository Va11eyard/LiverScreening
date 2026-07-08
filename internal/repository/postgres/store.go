package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/eyeeyeai/pilot/internal/domain"
	"github.com/eyeeyeai/pilot/internal/platform/config"
	"github.com/eyeeyeai/pilot/internal/platform/password"
	"github.com/eyeeyeai/pilot/internal/platform/seed"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Store struct {
	db *gorm.DB
}

func NewStore(cfg config.Config) (*Store, error) {
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if err := db.AutoMigrate(&domain.User{}, &domain.Case{}, &domain.Survey{}, &domain.CaseImage{}); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	if err := migratePatientSurnames(db); err != nil {
		return nil, fmt.Errorf("migrate patient surnames: %w", err)
	}

	store := &Store{db: db}
	if err := store.seedAdmin(cfg); err != nil {
		return nil, err
	}
	return store, nil
}

func migratePatientSurnames(db *gorm.DB) error {
	if !db.Migrator().HasColumn(&domain.Case{}, "child_surname") {
		return nil
	}
	if !db.Migrator().HasColumn(&domain.Case{}, "patient_id") {
		return nil
	}
	return db.Exec(`
		UPDATE cases
		SET child_surname = patient_id
		WHERE COALESCE(child_surname, '') = ''
		  AND patient_id IS NOT NULL
		  AND patient_id <> ''
	`).Error
}

func (s *Store) seedAdmin(cfg config.Config) error {
	var count int64
	if err := s.db.Model(&domain.User{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	var users []domain.User
	for _, su := range seed.UserSpecs(cfg, nil) {
		hash, err := password.Hash(su.Password)
		if err != nil {
			return err
		}
		users = append(users, domain.User{
			ID:           uuid.New(),
			Email:        su.Email,
			PasswordHash: hash,
			Name:         su.Name,
			Role:         su.Role,
			Hospital:     su.Hospital,
		})
	}

	for _, u := range users {
		if err := s.db.Create(&u).Error; err != nil {
			return err
		}
	}
	slog.Info("seeded default users", "count", len(users))
	return nil
}

func (s *Store) FindUserByEmail(ctx context.Context, email string) (*domain.User, error) {
	var u domain.User
	if err := s.db.WithContext(ctx).Where("email = ?", email).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) NextCaseID(ctx context.Context) (string, error) {
	year := time.Now().Year()
	prefix := fmt.Sprintf("LIV-%d-", year)
	var count int64
	if err := s.db.WithContext(ctx).Model(&domain.Case{}).Where("case_id LIKE ?", prefix+"%").Count(&count).Error; err != nil {
		return "", err
	}
	return fmt.Sprintf("%s%03d", prefix, count+1), nil
}

func (s *Store) CreateCase(ctx context.Context, c *domain.Case) error {
	return s.db.WithContext(ctx).Create(c).Error
}

func (s *Store) FindCaseByCaseID(ctx context.Context, caseID string) (*domain.Case, error) {
	var c domain.Case
	if err := s.db.WithContext(ctx).Where("case_id = ?", caseID).First(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *Store) CreateCaseImage(ctx context.Context, img *domain.CaseImage) error {
	return s.db.WithContext(ctx).Create(img).Error
}

func (s *Store) ListCaseImages(ctx context.Context, caseID string) ([]domain.CaseImage, error) {
	var images []domain.CaseImage
	if err := s.db.WithContext(ctx).Where("case_id = ?", caseID).Order("created_at asc").Find(&images).Error; err != nil {
		return nil, err
	}
	return images, nil
}

func (s *Store) CountCaseImages(ctx context.Context, caseID string) (int64, error) {
	var count int64
	if err := s.db.WithContext(ctx).Model(&domain.CaseImage{}).Where("case_id = ?", caseID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (s *Store) FindCaseImageByID(ctx context.Context, caseID string, imageID uuid.UUID) (*domain.CaseImage, error) {
	var img domain.CaseImage
	if err := s.db.WithContext(ctx).Where("case_id = ? AND id = ?", caseID, imageID).First(&img).Error; err != nil {
		return nil, err
	}
	return &img, nil
}

func (s *Store) SoftDeleteCaseImage(ctx context.Context, imageID uuid.UUID) error {
	return s.db.WithContext(ctx).Delete(&domain.CaseImage{}, "id = ?", imageID).Error
}

func (s *Store) SoftDeleteCase(ctx context.Context, caseID string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("case_id = ?", caseID).Delete(&domain.CaseImage{}).Error; err != nil {
			return err
		}
		return tx.Where("case_id = ?", caseID).Delete(&domain.Case{}).Error
	})
}

func (s *Store) UpdateCaseAI(ctx context.Context, caseID string, aiMatch *string, snapshot datatypes.JSON) error {
	updates := map[string]any{}
	if aiMatch != nil {
		updates["ai_match"] = *aiMatch
	}
	if len(snapshot) > 0 {
		updates["ai_snapshot"] = snapshot
	}
	if len(updates) == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Model(&domain.Case{}).Where("case_id = ?", caseID).Updates(updates).Error
}

func (s *Store) ImageCountsByCaseIDs(ctx context.Context, caseIDs []string) (map[string]int, error) {
	out := make(map[string]int, len(caseIDs))
	if len(caseIDs) == 0 {
		return out, nil
	}
	type row struct {
		CaseID string
		Count  int
	}
	var rows []row
	if err := s.db.WithContext(ctx).
		Model(&domain.CaseImage{}).
		Select("case_id, count(*) as count").
		Where("case_id IN ?", caseIDs).
		Group("case_id").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.CaseID] = r.Count
	}
	return out, nil
}

func (s *Store) ListCases(ctx context.Context, f domain.CaseFilter) ([]domain.Case, error) {
	q := s.db.WithContext(ctx).Model(&domain.Case{}).Order("date desc, created_at desc")
	if f.Hospital != "" {
		q = q.Where("hospital ILIKE ?", "%"+f.Hospital+"%")
	}
	if f.DateFrom != "" {
		q = q.Where("date >= ?", f.DateFrom)
	}
	if f.DateTo != "" {
		q = q.Where("date <= ?", f.DateTo)
	}
	if f.Patient != "" {
		pat := "%" + f.Patient + "%"
		q = q.Where("mother_surname ILIKE ? OR child_surname ILIKE ?", pat, pat)
	}
	if f.Stage != "" {
		q = q.Where("stage = ?", f.Stage)
	}
	if f.Aprop {
		q = q.Where("aprop = ?", "Да (AP-ROP)")
	}
	if f.UserID != nil {
		q = q.Where("user_id = ?", *f.UserID)
	}
	var cases []domain.Case
	if err := q.Find(&cases).Error; err != nil {
		return nil, err
	}
	return cases, nil
}

func (s *Store) UpdateCase(ctx context.Context, c *domain.Case) error {
	return s.db.WithContext(ctx).Save(c).Error
}

func (s *Store) CreateSurvey(ctx context.Context, survey *domain.Survey) error {
	return s.db.WithContext(ctx).Create(survey).Error
}

func (s *Store) ListSurveys(ctx context.Context) ([]domain.Survey, error) {
	var surveys []domain.Survey
	if err := s.db.WithContext(ctx).Order("date desc, created_at desc").Find(&surveys).Error; err != nil {
		return nil, err
	}
	return surveys, nil
}

func (s *Store) ListSurveysByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Survey, error) {
	var surveys []domain.Survey
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Order("date desc, created_at desc").Find(&surveys).Error; err != nil {
		return nil, err
	}
	return surveys, nil
}

func (s *Store) UpdatePasswordHash(ctx context.Context, userID uuid.UUID, hash string) error {
	return s.db.WithContext(ctx).Model(&domain.User{}).Where("id = ?", userID).Update("password_hash", hash).Error
}

func ScoresToJSON(scores []int) ([]byte, error) {
	return json.Marshal(scores)
}

func ParseScores(raw []byte) ([]int, error) {
	var scores []int
	if err := json.Unmarshal(raw, &scores); err != nil {
		return nil, err
	}
	return scores, nil
}
