package usecase

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/eyeeyeai/pilot/internal/domain"
	"github.com/eyeeyeai/pilot/internal/platform/config"
	"github.com/eyeeyeai/pilot/internal/platform/password"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type authStore struct {
	mu         sync.Mutex
	users      map[string]*domain.User
	cases      map[string]*domain.Case
	nextCaseID int
}

func (s *authStore) FindUserByEmail(_ context.Context, email string) (*domain.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[email]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return u, nil
}

func (s *authStore) NextCaseID(context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextCaseID++
	return "EEA-2026-TEST", nil
}

func (s *authStore) CreateCase(_ context.Context, c *domain.Case) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cases[c.CaseID] = c
	return nil
}

func (s *authStore) UpdateCase(context.Context, *domain.Case) error { return nil }
func (s *authStore) FindCaseByCaseID(_ context.Context, caseID string) (*domain.Case, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.cases[caseID]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return c, nil
}
func (s *authStore) ListCases(context.Context, domain.CaseFilter) ([]domain.Case, error) {
	return nil, nil
}
func (s *authStore) CreateSurvey(context.Context, *domain.Survey) error { return nil }
func (s *authStore) ListSurveys(context.Context) ([]domain.Survey, error) {
	return nil, nil
}
func (s *authStore) ListSurveysByUserID(context.Context, uuid.UUID) ([]domain.Survey, error) {
	return nil, nil
}
func (s *authStore) UpdatePasswordHash(context.Context, uuid.UUID, string) error { return nil }
func (s *authStore) ImageCountsByCaseIDs(context.Context, []string) (map[string]int, error) {
	return nil, nil
}
func (s *authStore) CreateCaseImage(context.Context, *domain.CaseImage) error { return nil }
func (s *authStore) ListCaseImages(context.Context, string) ([]domain.CaseImage, error) {
	return nil, nil
}
func (s *authStore) CountCaseImages(context.Context, string) (int64, error) { return 0, nil }
func (s *authStore) FindCaseImageByID(context.Context, string, uuid.UUID) (*domain.CaseImage, error) {
	return nil, gorm.ErrRecordNotFound
}
func (s *authStore) SoftDeleteCaseImage(context.Context, uuid.UUID) error { return nil }
func (s *authStore) SoftDeleteCase(_ context.Context, caseID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cases, caseID)
	return nil
}
func (s *authStore) UpdateCaseAI(context.Context, string, *string, datatypes.JSON) error {
	return nil
}

func testAuthConfig() config.Config {
	return config.Config{
		JWTSecret:       "test-jwt-secret-with-32-characters-min",
		AccessTokenTTL:  time.Hour,
		RefreshTokenTTL: 24 * time.Hour,
	}
}

func TestLogin_SuccessAndFailure(t *testing.T) {
	hash, err := password.Hash("correct-pass")
	if err != nil {
		t.Fatal(err)
	}
	userID := uuid.New()
	store := &authStore{
		users: map[string]*domain.User{
			"doctor@eyeeye.kz": {
				ID:           userID,
				Email:        "doctor@eyeeye.kz",
				PasswordHash: hash,
				Name:         "Test Doctor",
				Role:         domain.RoleDoctor,
				Hospital:     "Test Hospital",
			},
		},
	}
	svc := New(store, testAuthConfig(), nil, nil)

	res, err := svc.Login(context.Background(), domain.LoginInput{
		Email:    "doctor@eyeeye.kz",
		Password: "correct-pass",
	})
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if res.User.Email != "doctor@eyeeye.kz" || res.User.Hospital != "Test Hospital" {
		t.Fatalf("unexpected user %+v", res.User)
	}
	if res.Tokens.AccessToken == "" || res.Tokens.RefreshToken == "" {
		t.Fatal("expected token pair")
	}

	_, err = svc.Login(context.Background(), domain.LoginInput{
		Email:    "doctor@eyeeye.kz",
		Password: "wrong-pass",
	})
	if !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expected unauthorized, got %v", err)
	}
}

func TestCreateCase_SetsPatientID(t *testing.T) {
	userID := uuid.New()
	store := &authStore{cases: map[string]*domain.Case{}}
	svc := New(store, testAuthConfig(), nil, nil)
	claims := &Claims{UserID: userID.String(), Role: domain.RoleDoctor}

	c, err := svc.CreateCase(context.Background(), claims, domain.CreateCaseInput{
		Date:          "2026-07-02",
		Hospital:      "Test",
		Doctor:        "Doc",
		MotherSurname: "Иванова",
		ChildSurname:  "Петрова",
		Stage:         "Ст. 1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if c.PatientID != "Иванова (Петрова)" {
		t.Fatalf("patient_id = %q, want Иванова (Петрова)", c.PatientID)
	}
}

func TestCreateCaseWithImages_RequiresImageForDoctor(t *testing.T) {
	userID := uuid.New()
	store := &authStore{cases: map[string]*domain.Case{}}
	svc := New(store, testAuthConfig(), nil, nil)
	claims := &Claims{UserID: userID.String(), Role: domain.RoleDoctor}
	in := domain.CreateCaseInput{
		Date:          "2026-07-02",
		Hospital:      "Test",
		Doctor:        "Doc",
		MotherSurname: "Иванова",
		ChildSurname:  "Петрова",
		Stage:         "Ст. 1",
	}

	_, _, err := svc.CreateCaseWithImages(context.Background(), claims, in, nil)
	if !errors.Is(err, ErrImagesRequired) {
		t.Fatalf("expected ErrImagesRequired, got %v", err)
	}
	if len(store.cases) != 0 {
		t.Fatal("expected no case created without images")
	}
}

func TestGetCase_DoctorCannotAccessOtherCase(t *testing.T) {
	owner := uuid.New()
	other := uuid.New()
	store := &authStore{
		cases: map[string]*domain.Case{
			"EEA-2026-099": {CaseID: "EEA-2026-099", UserID: owner, Stage: "Ст. 1"},
		},
	}
	svc := New(store, testAuthConfig(), nil, nil)

	_, err := svc.GetCase(context.Background(), &Claims{UserID: other.String(), Role: domain.RoleDoctor}, "EEA-2026-099")
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestDeleteCase_CoordinatorCanDeleteAnyCase(t *testing.T) {
	owner := uuid.New()
	store := &authStore{
		cases: map[string]*domain.Case{
			"EEA-2026-099": {CaseID: "EEA-2026-099", UserID: owner, Stage: "Ст. 1"},
		},
	}
	svc := New(store, testAuthConfig(), nil, nil)

	err := svc.DeleteCase(context.Background(), &Claims{UserID: uuid.New().String(), Role: domain.RoleCoordinator}, "EEA-2026-099")
	if err != nil {
		t.Fatalf("coordinator delete: %v", err)
	}
	if _, ok := store.cases["EEA-2026-099"]; ok {
		t.Fatal("case should be deleted")
	}
}

func TestDeleteCase_DoctorCannotDeleteOtherCase(t *testing.T) {
	owner := uuid.New()
	other := uuid.New()
	store := &authStore{
		cases: map[string]*domain.Case{
			"EEA-2026-099": {CaseID: "EEA-2026-099", UserID: owner, Stage: "Ст. 1"},
		},
	}
	svc := New(store, testAuthConfig(), nil, nil)

	err := svc.DeleteCase(context.Background(), &Claims{UserID: other.String(), Role: domain.RoleDoctor}, "EEA-2026-099")
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
}
