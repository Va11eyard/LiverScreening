package usecase

import (
	"context"

	"github.com/eyeeyeai/pilot/internal/domain"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Store interface {
	FindUserByEmail(ctx context.Context, email string) (*domain.User, error)
	NextCaseID(ctx context.Context) (string, error)
	CreateCase(ctx context.Context, c *domain.Case) error
	UpdateCase(ctx context.Context, c *domain.Case) error
	FindCaseByCaseID(ctx context.Context, caseID string) (*domain.Case, error)
	ListCases(ctx context.Context, f domain.CaseFilter) ([]domain.Case, error)
	CreateSurvey(ctx context.Context, survey *domain.Survey) error
	ListSurveys(ctx context.Context) ([]domain.Survey, error)
	ListSurveysByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Survey, error)
	UpdatePasswordHash(ctx context.Context, userID uuid.UUID, hash string) error
	ImageCountsByCaseIDs(ctx context.Context, caseIDs []string) (map[string]int, error)
	CreateCaseImage(ctx context.Context, img *domain.CaseImage) error
	ListCaseImages(ctx context.Context, caseID string) ([]domain.CaseImage, error)
	CountCaseImages(ctx context.Context, caseID string) (int64, error)
	FindCaseImageByID(ctx context.Context, caseID string, imageID uuid.UUID) (*domain.CaseImage, error)
	SoftDeleteCaseImage(ctx context.Context, imageID uuid.UUID) error
	SoftDeleteCase(ctx context.Context, caseID string) error
	UpdateCaseAI(ctx context.Context, caseID string, aiMatch *string, snapshot datatypes.JSON) error
}
