package usecase

import (
	"context"
	"errors"
	"mime/multipart"
	"testing"

	"github.com/eyeeyeai/pilot/internal/domain"
	"github.com/eyeeyeai/pilot/internal/platform/config"
	"github.com/eyeeyeai/pilot/internal/platform/storage"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type fakeStore struct {
	caseRec      *domain.Case
	imageCount   int64
	createCalled int
}

func (f *fakeStore) FindUserByEmail(context.Context, string) (*domain.User, error) {
	panic("not implemented")
}
func (f *fakeStore) NextCaseID(context.Context) (string, error) { panic("not implemented") }
func (f *fakeStore) CreateCase(context.Context, *domain.Case) error {
	panic("not implemented")
}
func (f *fakeStore) UpdateCase(context.Context, *domain.Case) error { return nil }
func (f *fakeStore) FindCaseByCaseID(_ context.Context, caseID string) (*domain.Case, error) {
	if f.caseRec == nil || f.caseRec.CaseID != caseID {
		return nil, gorm.ErrRecordNotFound
	}
	return f.caseRec, nil
}
func (f *fakeStore) ListCases(context.Context, domain.CaseFilter) ([]domain.Case, error) {
	panic("not implemented")
}
func (f *fakeStore) CreateSurvey(context.Context, *domain.Survey) error { panic("not implemented") }
func (f *fakeStore) ListSurveys(context.Context) ([]domain.Survey, error) {
	panic("not implemented")
}
func (f *fakeStore) ListSurveysByUserID(context.Context, uuid.UUID) ([]domain.Survey, error) {
	panic("not implemented")
}
func (f *fakeStore) UpdatePasswordHash(context.Context, uuid.UUID, string) error {
	return nil
}
func (f *fakeStore) ImageCountsByCaseIDs(context.Context, []string) (map[string]int, error) {
	panic("not implemented")
}
func (f *fakeStore) CreateCaseImage(context.Context, *domain.CaseImage) error {
	f.createCalled++
	return nil
}
func (f *fakeStore) ListCaseImages(context.Context, string) ([]domain.CaseImage, error) {
	panic("not implemented")
}
func (f *fakeStore) CountCaseImages(context.Context, string) (int64, error) {
	return f.imageCount, nil
}
func (f *fakeStore) FindCaseImageByID(context.Context, string, uuid.UUID) (*domain.CaseImage, error) {
	panic("not implemented")
}
func (f *fakeStore) SoftDeleteCaseImage(context.Context, uuid.UUID) error { return nil }
func (f *fakeStore) SoftDeleteCase(context.Context, string) error         { return nil }
func (f *fakeStore) UpdateCaseAI(context.Context, string, *string, datatypes.JSON) error {
	return nil
}

func TestUploadCaseImages_RejectsWhenMaxFilesExceeded(t *testing.T) {
	dir := t.TempDir()
	files, err := storage.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	userID := uuid.New()
	store := &fakeStore{
		caseRec: &domain.Case{
			CaseID: "EEA-2026-001",
			UserID: userID,
		},
		imageCount: storage.MaxFilesPerCase,
	}
	svc := New(store, config.Config{}, files, nil)
	claims := &Claims{UserID: userID.String(), Role: domain.RoleDoctor}

	_, err = svc.UploadCaseImages(context.Background(), claims, "EEA-2026-001", []*multipart.FileHeader{{Filename: "a.jpg", Size: 100}})
	if !errors.Is(err, storage.ErrTooManyFiles) {
		t.Fatalf("expected ErrTooManyFiles, got %v", err)
	}
	if store.createCalled != 0 {
		t.Fatalf("expected no images created, got %d", store.createCalled)
	}
}

func TestGetCase_ForbidsOtherDoctor(t *testing.T) {
	owner := uuid.New()
	other := uuid.New()
	store := &fakeStore{
		caseRec: &domain.Case{CaseID: "EEA-2026-002", UserID: owner},
	}
	svc := New(store, config.Config{}, nil, nil)
	_, err := svc.GetCase(context.Background(), &Claims{UserID: other.String(), Role: domain.RoleDoctor}, "EEA-2026-002")
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestGetCase_AllowsCoordinator(t *testing.T) {
	owner := uuid.New()
	store := &getCaseStore{
		fakeStore: fakeStore{
			caseRec: &domain.Case{CaseID: "EEA-2026-003", UserID: owner, Stage: "Ст. 2"},
		},
	}
	svc := New(store, config.Config{}, nil, nil)
	detail, err := svc.GetCase(context.Background(), &Claims{UserID: uuid.New().String(), Role: domain.RoleCoordinator}, "EEA-2026-003")
	if err != nil {
		t.Fatal(err)
	}
	if detail.CaseID != "EEA-2026-003" || detail.Stage != "Ст. 2" {
		t.Fatalf("unexpected detail %+v", detail)
	}
}

type getCaseStore struct {
	fakeStore
}

func (g *getCaseStore) ListCaseImages(context.Context, string) ([]domain.CaseImage, error) {
	return nil, nil
}
