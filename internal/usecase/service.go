package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"mime/multipart"
	"strconv"
	"strings"
	"time"

	"github.com/eyeeyeai/pilot/internal/domain"
	"github.com/eyeeyeai/pilot/internal/platform/ai"
	"github.com/eyeeyeai/pilot/internal/platform/config"
	"github.com/eyeeyeai/pilot/internal/platform/excel"
	"github.com/eyeeyeai/pilot/internal/platform/exportarchive"
	"github.com/eyeeyeai/pilot/internal/platform/password"
	"github.com/eyeeyeai/pilot/internal/platform/storage"
	"github.com/eyeeyeai/pilot/internal/platform/trainingexport"
	"github.com/eyeeyeai/pilot/internal/repository/postgres"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

var ErrUnauthorized = errors.New("unauthorized")
var ErrForbidden = errors.New("forbidden")
var ErrNotFound = errors.New("not found")
var ErrImagesRequired = errors.New("at least one image required")

type Claims struct {
	UserID   string      `json:"user_id"`
	Email    string      `json:"email"`
	Name     string      `json:"name"`
	Role     domain.Role `json:"role"`
	Hospital string      `json:"hospital,omitempty"`
	TokenType string     `json:"token_type"`
	jwt.RegisteredClaims
}

type Service struct {
	store Store
	cfg   config.Config
	files *storage.Store
	ai    *ai.Client
}

func New(store Store, cfg config.Config, files *storage.Store, aiClient *ai.Client) *Service {
	return &Service{store: store, cfg: cfg, files: files, ai: aiClient}
}

func (s *Service) Login(ctx context.Context, in domain.LoginInput) (*domain.LoginResponse, error) {
	user, err := s.store.FindUserByEmail(ctx, in.Email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUnauthorized
		}
		return nil, err
	}
	if err := password.Verify(user.PasswordHash, in.Password); err != nil {
		return nil, ErrUnauthorized
	}
	if password.NeedsRehash(user.PasswordHash) {
		if hash, err := password.Hash(in.Password); err == nil {
			_ = s.store.UpdatePasswordHash(ctx, user.ID, hash)
		}
	}
	tokens, err := s.issueTokens(user)
	if err != nil {
		return nil, err
	}
	return &domain.LoginResponse{
		Tokens: *tokens,
		User: domain.AuthUser{
			ID:       user.ID,
			Email:    user.Email,
			Name:     user.Name,
			Role:     user.Role,
			Hospital: user.Hospital,
		},
	}, nil
}

func (s *Service) Refresh(ctx context.Context, refreshToken string) (*domain.TokenPair, error) {
	claims, err := s.parseToken(refreshToken, "refresh")
	if err != nil {
		return nil, ErrUnauthorized
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return nil, ErrUnauthorized
	}
	user, err := s.store.FindUserByEmail(ctx, claims.Email)
	if err != nil || user.ID != userID {
		return nil, ErrUnauthorized
	}
	return s.issueTokens(user)
}

func (s *Service) ParseAccessToken(token string) (*Claims, error) {
	return s.parseToken(token, "access")
}

// liveRole reloads role from DB for sensitive operations (exports).
func (s *Service) liveRole(ctx context.Context, claims *Claims) (domain.Role, error) {
	if claims == nil || claims.Email == "" {
		return "", ErrUnauthorized
	}
	user, err := s.store.FindUserByEmail(ctx, claims.Email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrUnauthorized
		}
		return "", err
	}
	return user.Role, nil
}

func (s *Service) issueTokens(user *domain.User) (*domain.TokenPair, error) {
	now := time.Now()
	accessClaims := s.baseClaims(user, "access", now, s.cfg.AccessTokenTTL)
	refreshClaims := s.baseClaims(user, "refresh", now, s.cfg.RefreshTokenTTL)

	access, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return nil, err
	}
	refresh, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return nil, err
	}
	return &domain.TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int64(s.cfg.AccessTokenTTL.Seconds()),
	}, nil
}

func (s *Service) baseClaims(user *domain.User, tokenType string, now time.Time, ttl time.Duration) Claims {
	return Claims{
		UserID:    user.ID.String(),
		Email:     user.Email,
		Name:      user.Name,
		Role:      user.Role,
		Hospital:  user.Hospital,
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
}

func (s *Service) parseToken(token, expectedType string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid || claims.TokenType != expectedType {
		return nil, ErrUnauthorized
	}
	return claims, nil
}

func (s *Service) CreateCase(ctx context.Context, claims *Claims, in domain.CreateCaseInput) (*domain.Case, error) {
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return nil, ErrUnauthorized
	}
	caseID, err := s.store.NextCaseID(ctx)
	if err != nil {
		return nil, err
	}
	c := &domain.Case{
		ID:             uuid.New(),
		CaseID:         caseID,
		UserID:         userID,
		Date:           in.Date,
		Hospital:       in.Hospital,
		Doctor:         in.Doctor,
		MotherSurname:  in.MotherSurname,
		ChildSurname:   in.ChildSurname,
		PatientID:      domain.PatientLabel(in.MotherSurname, in.ChildSurname),
		GA:             in.GA,
		BW:             in.BW,
		PCA:            in.PCA,
		PH:             in.PH,
		Eye:            in.Eye,
		Visit:          in.Visit,
		RiskFactors:    in.RiskFactors,
		Camera:         in.Camera,
		ImageQuality:   in.ImageQuality,
		AvascColor:     in.AvascColor,
		AvascHours:     in.AvascHours,
		AvascLoc:       in.AvascLoc,
		Zone:           in.Zone,
		ArtDiam:        in.ArtDiam,
		ArtCourse:      in.ArtCourse,
		Veins:          in.Veins,
		AvpDZN:         in.AvpDZN,
		RopForm:        in.RopForm,
		Stage:          in.Stage,
		PlusDisease:    in.PlusDisease,
		Aprop:          in.Aprop,
		PreDiag:        in.PreDiag,
		Confidence:     in.Confidence,
		Recommendation: in.Recommendation,
		Doubtful:       in.Doubtful,
		Notes:          in.Notes,
	}
	if err := s.store.CreateCase(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *Service) CreateCaseWithImages(ctx context.Context, claims *Claims, in domain.CreateCaseInput, files []*multipart.FileHeader) (*domain.Case, *domain.UploadCaseImagesResult, error) {
	if claims.Role == domain.RoleDoctor && len(files) == 0 {
		return nil, nil, ErrImagesRequired
	}
	cse, err := s.CreateCase(ctx, claims, in)
	if err != nil {
		return nil, nil, err
	}
	if len(files) == 0 {
		return cse, &domain.UploadCaseImagesResult{}, nil
	}
	result, err := s.UploadCaseImages(ctx, claims, cse.CaseID, files)
	if err != nil {
		if delErr := s.store.SoftDeleteCase(ctx, cse.CaseID); delErr != nil {
			slog.Warn("rollback case after image upload failed", "case_id", cse.CaseID, "error", delErr)
		}
		return nil, nil, err
	}
	return cse, result, nil
}

func (s *Service) ListCases(ctx context.Context, claims *Claims, f domain.CaseFilter) ([]domain.Case, error) {
	if claims.Role == domain.RoleDoctor {
		uid, err := uuid.Parse(claims.UserID)
		if err != nil {
			return nil, ErrUnauthorized
		}
		f.UserID = &uid
	}
	return s.store.ListCases(ctx, f)
}

func (s *Service) CreateSurvey(ctx context.Context, claims *Claims, in domain.CreateSurveyInput) (*domain.Survey, error) {
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return nil, ErrUnauthorized
	}
	raw, err := postgres.ScoresToJSON(in.Scores)
	if err != nil {
		return nil, err
	}
	survey := &domain.Survey{
		ID:          uuid.New(),
		UserID:      userID,
		Date:        in.Date,
		Hospital:    in.Hospital,
		Scores:      datatypes.JSON(raw),
		UXAvg:       in.UXAvg,
		ClinicalAvg: in.ClinicalAvg,
		ProcessAvg:  in.ProcessAvg,
		TotalAvg:    in.TotalAvg,
		Comment:     in.Comment,
	}
	if err := s.store.CreateSurvey(ctx, survey); err != nil {
		return nil, err
	}
	return survey, nil
}

func (s *Service) ListSurveys(ctx context.Context, claims *Claims) ([]domain.Survey, error) {
	if claims.Role != domain.RoleDoctor && claims.Role != domain.RoleCoordinator && claims.Role != domain.RoleAdmin {
		return nil, ErrForbidden
	}
	if claims.Role == domain.RoleDoctor {
		userID, err := uuid.Parse(claims.UserID)
		if err != nil {
			return nil, ErrUnauthorized
		}
		return s.store.ListSurveysByUserID(ctx, userID)
	}
	return s.store.ListSurveys(ctx)
}

func (s *Service) WeeklyReport(ctx context.Context, claims *Claims, f domain.CaseFilter) ([]domain.WeeklyRow, error) {
	cases, err := s.ListCases(ctx, claims, f)
	if err != nil {
		return nil, err
	}
	caseIDs := make([]string, len(cases))
	for i, c := range cases {
		caseIDs[i] = c.CaseID
	}
	counts, err := s.store.ImageCountsByCaseIDs(ctx, caseIDs)
	if err != nil {
		return nil, err
	}
	return domain.ToWeeklyRows(cases, counts), nil
}

func (s *Service) StageReport(ctx context.Context, claims *Claims, f domain.CaseFilter) ([]domain.StageRow, error) {
	cases, err := s.ListCases(ctx, claims, f)
	if err != nil {
		return nil, err
	}
	return domain.ComputeStageRows(cases), nil
}

func (s *Service) HospitalReport(ctx context.Context, claims *Claims, f domain.CaseFilter) ([]domain.HospitalRow, error) {
	role, err := s.liveRole(ctx, claims)
	if err != nil {
		return nil, err
	}
	if role == domain.RoleDoctor {
		return nil, ErrForbidden
	}
	cases, err := s.ListCases(ctx, claims, f)
	if err != nil {
		return nil, err
	}
	return domain.ComputeHospitalRows(cases), nil
}

func (s *Service) ReportData(ctx context.Context, claims *Claims, f domain.CaseFilter) ([]domain.Case, []domain.Survey, error) {
	cases, err := s.ListCases(ctx, claims, f)
	if err != nil {
		return nil, nil, err
	}
	surveys, err := s.store.ListSurveys(ctx)
	if err != nil {
		return nil, nil, err
	}
	if claims.Role == domain.RoleDoctor {
		surveys = filterSurveysByUser(surveys, claims.UserID)
	}
	return cases, surveys, nil
}

func (s *Service) GenerateFullExcelReport(ctx context.Context) ([]byte, string, error) {
	cases, err := s.store.ListCases(ctx, domain.CaseFilter{})
	if err != nil {
		return nil, "", err
	}
	surveys, err := s.store.ListSurveys(ctx)
	if err != nil {
		return nil, "", err
	}
	data, err := excel.BuildReport(cases, surveys)
	if err != nil {
		return nil, "", err
	}
	return data, excel.Filename(), nil
}

func (s *Service) GenerateSurveyExcelReport(ctx context.Context, claims *Claims) ([]byte, string, error) {
	surveys, err := s.ListSurveys(ctx, claims)
	if err != nil {
		return nil, "", err
	}
	data, err := excel.BuildSurveyReport(surveys)
	if err != nil {
		return nil, "", err
	}
	return data, excel.SurveyFilename(), nil
}

func (s *Service) RunScheduledExcelExport(ctx context.Context) (string, error) {
	data, name, err := s.GenerateFullExcelReport(ctx)
	if err != nil {
		return "", err
	}
	if err := exportarchive.Write(s.cfg.ExcelExportDir, name, data); err != nil {
		return "", err
	}
	return name, nil
}

func (s *Service) ListArchivedExcelExports() ([]exportarchive.Entry, error) {
	return exportarchive.List(s.cfg.ExcelExportDir)
}

func (s *Service) ReadArchivedExcelExport(filename string) ([]byte, error) {
	return exportarchive.Read(s.cfg.ExcelExportDir, filename)
}

func filterSurveysByUser(surveys []domain.Survey, userID string) []domain.Survey {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil
	}
	out := make([]domain.Survey, 0)
	for _, s := range surveys {
		if s.UserID == uid {
			out = append(out, s)
		}
	}
	return out
}

func CanDownloadFullExcel(role domain.Role) bool {
	return role == domain.RoleCoordinator || role == domain.RoleAdmin
}

func CanDownloadCaseImages(role domain.Role) bool {
	return role == domain.RoleCoordinator || role == domain.RoleAdmin
}

func (s *Service) RequireCoordinatorExport(ctx context.Context, claims *Claims) error {
	role, err := s.liveRole(ctx, claims)
	if err != nil {
		return err
	}
	if !CanDownloadFullExcel(role) {
		return ErrForbidden
	}
	return nil
}

func (s *Service) UploadCaseImages(ctx context.Context, claims *Claims, caseID string, files []*multipart.FileHeader) (*domain.UploadCaseImagesResult, error) {
	if claims.Role != domain.RoleDoctor {
		return nil, ErrForbidden
	}
	cse, err := s.store.FindCaseByCaseID(ctx, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if cse.UserID != userID {
		return nil, ErrForbidden
	}

	existing, err := s.store.CountCaseImages(ctx, caseID)
	if err != nil {
		return nil, err
	}
	if existing+int64(len(files)) > storage.MaxFilesPerCase {
		return nil, storage.ErrTooManyFiles
	}

	out := make([]domain.CaseImageInfo, 0, len(files))
	var firstSaved *domain.CaseImage
	for _, fh := range files {
		saved, err := s.files.Save(caseID, fh)
		if err != nil {
			return &domain.UploadCaseImagesResult{Images: out}, err
		}
		img := &domain.CaseImage{
			ID:           uuid.New(),
			CaseID:       caseID,
			UserID:       userID,
			OriginalName: fh.Filename,
			StoredName:   saved.StoredName,
			MimeType:     saved.MimeType,
			SizeBytes:    saved.SizeBytes,
		}
		if err := s.store.CreateCaseImage(ctx, img); err != nil {
			return &domain.UploadCaseImagesResult{Images: out}, err
		}
		out = append(out, img.ToInfo())
		if firstSaved == nil {
			firstSaved = img
		}
	}

	result := &domain.UploadCaseImagesResult{Images: out}
	if firstSaved != nil {
		result.AI = s.runInference(ctx, cse, firstSaved)
	}
	return result, nil
}

func (s *Service) runInference(ctx context.Context, cse *domain.Case, img *domain.CaseImage) *domain.UploadAIBlock {
	block := &domain.UploadAIBlock{Status: "skipped"}
	if s.ai == nil || !s.ai.Enabled() {
		return block
	}

	data, err := s.files.ReadFile(img.CaseID, img.StoredName)
	if err != nil {
		slog.Warn("ai inference read file failed", "case_id", cse.CaseID, "error", err)
		block.Status = "error"
		block.Error = "failed to read image"
		return block
	}

	resp, err := s.ai.Analyze(ctx, ai.InferenceRequest{
		CaseID:    cse.CaseID,
		PatientID: domain.PatientLabel(cse.MotherSurname, cse.ChildSurname),
		Eye:       cse.Eye,
		Etiology:  cse.Eye,
		Age:       cse.GA,
		ALT:       cse.PCA,
		AST:       parseASTInt(cse.PH),
		Platelets: cse.BW,
		HBV:       cse.Aprop,
	}, data, img.OriginalName, img.MimeType)
	if err != nil {
		slog.Warn("ai inference failed", "case_id", cse.CaseID, "error", err)
		block.Status = "error"
		block.Error = "inference service unavailable"
		snapshot, _ := json.Marshal(ai.Snapshot{
			Status:     "error",
			Error:      err.Error(),
			AnalyzedAt: time.Now().UTC(),
		})
		_ = s.store.UpdateCaseAI(ctx, cse.CaseID, nil, datatypes.JSON(snapshot))
		return block
	}

	match := ai.ComputeMatch(cse, *resp)
	suggestions := inferenceToMap(*resp)
	snapshot, err := json.Marshal(ai.Snapshot{
		Status:      "ok",
		Suggestions: *resp,
		AnalyzedAt:  time.Now().UTC(),
	})
	if err != nil {
		block.Status = "error"
		block.Error = "failed to encode snapshot"
		return block
	}
	if err := s.store.UpdateCaseAI(ctx, cse.CaseID, &match, datatypes.JSON(snapshot)); err != nil {
		slog.Warn("ai snapshot persist failed", "case_id", cse.CaseID, "error", err)
	}

	block.Status = "ok"
	block.Suggestions = suggestions
	block.AIMatch = match
	return block
}

func inferenceToMap(r ai.InferenceResponse) map[string]string {
	m := map[string]string{}
	if r.Stage != "" {
		m["stage"] = r.Stage
	}
	if r.PlusDisease != "" {
		m["plusDisease"] = r.PlusDisease
	}
	if r.AvascColor != "" {
		m["avascColor"] = r.AvascColor
	}
	if r.Zone != "" {
		m["zone"] = r.Zone
	}
	if r.RopForm != "" {
		m["ropForm"] = r.RopForm
	}
	if r.PreDiag != "" {
		m["preDiag"] = r.PreDiag
	}
	if r.Confidence != "" {
		m["confidence"] = r.Confidence
	}
	if r.Aprop != "" {
		m["aprop"] = r.Aprop
	}
	return m
}

func (s *Service) GetCase(ctx context.Context, claims *Claims, caseID string) (*domain.CaseDetail, error) {
	cse, err := s.store.FindCaseByCaseID(ctx, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if err := s.assertCaseImageAccess(claims, cse); err != nil {
		return nil, err
	}
	images, err := s.store.ListCaseImages(ctx, caseID)
	if err != nil {
		return nil, err
	}
	imgInfos := make([]domain.CaseImageInfo, len(images))
	for i, img := range images {
		imgInfos[i] = img.ToInfo()
	}
	return &domain.CaseDetail{Case: *cse, Images: imgInfos}, nil
}

func (s *Service) UpdateCase(ctx context.Context, claims *Claims, caseID string, in domain.PatchCaseInput) (*domain.Case, error) {
	if claims.Role != domain.RoleDoctor {
		return nil, ErrForbidden
	}
	cse, err := s.store.FindCaseByCaseID(ctx, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if cse.UserID != userID {
		return nil, ErrForbidden
	}
	applyPatchCaseUpdates(cse, in)
	if err := s.store.UpdateCase(ctx, cse); err != nil {
		return nil, err
	}
	return cse, nil
}

func applyPatchCaseUpdates(c *domain.Case, in domain.PatchCaseInput) {
	if in.Stage != "" {
		c.Stage = in.Stage
	}
	if in.PreDiag != "" {
		c.PreDiag = in.PreDiag
	}
	c.Notes = in.Notes
}

func (s *Service) DownloadTrainingExport(ctx context.Context, claims *Claims, f domain.CaseFilter) ([]byte, string, error) {
	role, err := s.liveRole(ctx, claims)
	if err != nil {
		return nil, "", err
	}
	if !CanDownloadFullExcel(role) {
		return nil, "", ErrForbidden
	}
	cases, err := s.ListCases(ctx, claims, f)
	if err != nil {
		return nil, "", err
	}
	var exportRows []trainingexport.Row
	fileData := make(map[string][]byte)
	for _, cse := range cases {
		images, err := s.store.ListCaseImages(ctx, cse.CaseID)
		if err != nil {
			return nil, "", err
		}
		for _, img := range images {
			ext := filepathExt(img.OriginalName, img.MimeType)
			fileName := trainingexport.ImageFileName(cse.CaseID, img.ID.String(), ext)
			data, err := s.files.ReadFile(cse.CaseID, img.StoredName)
			if err != nil {
				slog.Warn("training export skip image", "case_id", cse.CaseID, "image_id", img.ID, "error", err)
				continue
			}
			fileData[fileName] = data
			exportRows = append(exportRows, trainingexport.Row{
				Case:         cse,
				ImageID:      img.ID.String(),
				OriginalName: img.OriginalName,
				UploadedAt:   img.CreatedAt,
				FileName:     fileName,
			})
		}
	}
	if len(exportRows) == 0 {
		return nil, "", ErrNotFound
	}
	data, err := trainingexport.BuildZIPFromRows(exportRows, fileData)
	if err != nil {
		return nil, "", err
	}
	name := fmt.Sprintf("EyeEyeAI_Training_%s.zip", time.Now().Format("2006-01-02"))
	return data, name, nil
}

func filepathExt(originalName, mimeType string) string {
	if i := strings.LastIndex(originalName, "."); i >= 0 {
		return originalName[i+1:]
	}
	switch mimeType {
	case "image/png":
		return "png"
	case "image/tiff":
		return "tiff"
	default:
		return "jpg"
	}
}

func (s *Service) DeleteCaseImage(ctx context.Context, claims *Claims, caseID, imageIDStr string) error {
	if claims.Role != domain.RoleDoctor {
		return ErrForbidden
	}
	cse, err := s.store.FindCaseByCaseID(ctx, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return ErrUnauthorized
	}
	if cse.UserID != userID {
		return ErrForbidden
	}
	imageID, err := uuid.Parse(imageIDStr)
	if err != nil {
		return ErrNotFound
	}
	if _, err := s.store.FindCaseImageByID(ctx, caseID, imageID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	if err := s.store.SoftDeleteCaseImage(ctx, imageID); err != nil {
		return err
	}
	return nil
}

func (s *Service) DeleteCase(ctx context.Context, claims *Claims, caseID string) error {
	cse, err := s.store.FindCaseByCaseID(ctx, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		return err
	}
	if claims.Role == domain.RoleCoordinator || claims.Role == domain.RoleAdmin {
		return s.store.SoftDeleteCase(ctx, cse.CaseID)
	}
	if claims.Role != domain.RoleDoctor {
		return ErrForbidden
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return ErrUnauthorized
	}
	if cse.UserID != userID {
		return ErrForbidden
	}
	return s.store.SoftDeleteCase(ctx, caseID)
}

func (s *Service) ListCaseImages(ctx context.Context, claims *Claims, caseID string) ([]domain.CaseImageInfo, error) {
	cse, err := s.store.FindCaseByCaseID(ctx, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if err := s.assertCaseImageAccess(claims, cse); err != nil {
		return nil, err
	}
	images, err := s.store.ListCaseImages(ctx, caseID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.CaseImageInfo, len(images))
	for i, img := range images {
		out[i] = img.ToInfo()
	}
	return out, nil
}

func (s *Service) DownloadCaseImagesArchive(ctx context.Context, claims *Claims, caseID string) ([]byte, string, error) {
	role, err := s.liveRole(ctx, claims)
	if err != nil {
		return nil, "", err
	}
	if !CanDownloadCaseImages(role) {
		return nil, "", ErrForbidden
	}
	if _, err := s.store.FindCaseByCaseID(ctx, caseID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", ErrNotFound
		}
		return nil, "", err
	}
	images, err := s.store.ListCaseImages(ctx, caseID)
	if err != nil {
		return nil, "", err
	}
	if len(images) == 0 {
		return nil, "", ErrNotFound
	}
	entries := make([]storage.ZipEntry, len(images))
	for i, img := range images {
		entries[i] = storage.ZipEntry{Name: img.OriginalName, StoredName: img.StoredName}
	}
	data, err := s.files.BuildArchive(caseID, entries)
	if err != nil {
		return nil, "", err
	}
	return data, fmt.Sprintf("EyeEye_%s_images.zip", caseID), nil
}

func (s *Service) GetCaseImageFile(ctx context.Context, claims *Claims, caseID, imageIDStr string) ([]byte, string, string, error) {
	cse, err := s.store.FindCaseByCaseID(ctx, caseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", "", ErrNotFound
		}
		return nil, "", "", err
	}
	if err := s.assertCaseImageAccess(claims, cse); err != nil {
		return nil, "", "", err
	}
	imageID, err := uuid.Parse(imageIDStr)
	if err != nil {
		return nil, "", "", ErrNotFound
	}
	img, err := s.store.FindCaseImageByID(ctx, caseID, imageID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", "", ErrNotFound
		}
		return nil, "", "", err
	}
	data, err := s.files.ReadFile(caseID, img.StoredName)
	if err != nil {
		return nil, "", "", err
	}
	return data, img.MimeType, img.OriginalName, nil
}

func (s *Service) assertCaseImageAccess(claims *Claims, cse *domain.Case) error {
	if claims.Role == domain.RoleCoordinator || claims.Role == domain.RoleAdmin {
		return nil
	}
	if claims.Role != domain.RoleDoctor {
		return ErrForbidden
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return ErrUnauthorized
	}
	if cse.UserID != userID {
		return ErrForbidden
	}
	return nil
}

func parseASTInt(ph string) int {
	ph = strings.TrimSpace(ph)
	if ph == "" {
		return 0
	}
	if i := strings.Index(ph, "("); i > 0 {
		ph = strings.TrimSpace(ph[:i])
	}
	f, err := strconv.ParseFloat(ph, 64)
	if err != nil {
		return 0
	}
	return int(f)
}
