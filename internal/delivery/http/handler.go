package http

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/eyeeyeai/pilot/internal/domain"
	"github.com/eyeeyeai/pilot/internal/platform/audit"
	"github.com/eyeeyeai/pilot/internal/platform/config"
	"github.com/eyeeyeai/pilot/internal/platform/excel"
	"github.com/eyeeyeai/pilot/internal/platform/exportarchive"
	"github.com/eyeeyeai/pilot/internal/platform/ratelimit"
	"github.com/eyeeyeai/pilot/internal/platform/security"
	"github.com/eyeeyeai/pilot/internal/platform/storage"
	"github.com/eyeeyeai/pilot/internal/usecase"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc              *usecase.Service
	audit            *audit.Logger
	loginLimiter     *ratelimit.IPLimiter
	refreshLimiter   *ratelimit.IPLimiter
	apiLimiter       *ratelimit.IPLimiter
	trustedProxyIPs  []string
	cfg              config.Config
}

func NewHandler(svc *usecase.Service, auditLog *audit.Logger, loginLimiter, refreshLimiter, apiLimiter *ratelimit.IPLimiter, cfg config.Config) *Handler {
	return &Handler{
		svc:             svc,
		audit:           auditLog,
		loginLimiter:    loginLimiter,
		refreshLimiter:  refreshLimiter,
		apiLimiter:      apiLimiter,
		trustedProxyIPs: cfg.TrustedProxyIPs,
		cfg:             cfg,
	}
}

func (h *Handler) Register(r *gin.Engine) {
	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	v1 := r.Group("/api/v1")
	v1.Use(SecurityHeadersMiddleware(h.cfg))
	{
		v1.POST("/auth/login", h.login)
		v1.POST("/auth/refresh", h.rateLimitByIP(h.refreshLimiter), h.refresh)

		auth := v1.Group("")
		auth.Use(h.authMiddleware())
		auth.Use(h.rateLimitByUser(h.apiLimiter))
		auth.POST("/cases", h.createCase)
		auth.GET("/cases", h.listCases)
		auth.GET("/cases/:caseId", h.getCase)
		auth.PATCH("/cases/:caseId", h.updateCase)
		auth.DELETE("/cases/:caseId", h.deleteCase)
		auth.POST("/cases/:caseId/images", h.uploadCaseImages)
		auth.DELETE("/cases/:caseId/images/:imageId", h.deleteCaseImage)
		auth.GET("/cases/:caseId/images/archive", h.downloadCaseImagesArchive)
		auth.GET("/cases/:caseId/images/:imageId/file", h.serveCaseImageFile)
		auth.GET("/cases/:caseId/images", h.listCaseImages)
		auth.POST("/surveys", h.createSurvey)
		auth.GET("/surveys", h.listSurveys)
		auth.GET("/reports/weekly", h.weeklyReport)
		auth.GET("/reports/stages", h.stageReport)
		auth.GET("/reports/hospitals", h.hospitalReport)
		auth.GET("/reports/excel", h.downloadExcel)
		auth.GET("/reports/survey-excel", h.downloadSurveyExcel)
		auth.GET("/reports/training-export", h.downloadTrainingExport)
		auth.GET("/reports/exports", h.listExcelExports)
		auth.GET("/reports/exports/:filename", h.downloadExcelExport)
	}
}

func (h *Handler) login(c *gin.Context) {
	ip := h.clientIP(c)
	if h.loginLimiter.TooMany(ip) {
		writeRateLimitHeaders(c, h.loginLimiter, 0)
		h.audit.Event("auth.login", audit.ClientIP(ip), audit.Outcome("rate_limited"))
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many login attempts"})
		return
	}

	var in domain.LoginInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	res, err := h.svc.Login(c.Request.Context(), in)
	if err != nil {
		if errors.Is(err, usecase.ErrUnauthorized) {
			h.loginLimiter.Record(ip)
			h.audit.Event("auth.login", audit.ClientIP(ip), audit.Detail("email", security.RedactEmail(in.Email)), audit.Outcome("failure"))
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
		writeError(c, err)
		return
	}
	h.loginLimiter.Reset(ip)
	h.audit.Event("auth.login", audit.UserID(res.User.ID.String()), audit.UserRole(string(res.User.Role)), audit.ClientIP(ip), audit.Outcome("success"))
	c.JSON(http.StatusOK, res)
}

func (h *Handler) refresh(c *gin.Context) {
	var body struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	tokens, err := h.svc.Refresh(c.Request.Context(), body.RefreshToken)
	if err != nil {
		writeAuthError(c, err)
		return
	}
	c.JSON(http.StatusOK, tokens)
}

func (h *Handler) createCase(c *gin.Context) {
	claims := claimsFromContext(c)
	if strings.Contains(c.GetHeader("Content-Type"), "multipart/form-data") {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, storage.MaxUploadRequestBytes)
		form, err := c.MultipartForm()
		if err != nil {
			if strings.Contains(err.Error(), "too large") || strings.Contains(err.Error(), "request body too large") {
				c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request too large"})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid multipart form"})
			return
		}
		dataField := form.Value["data"]
		if len(dataField) == 0 || dataField[0] == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}
		var in domain.CreateCaseInput
		if err := json.Unmarshal([]byte(dataField[0]), &in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}
		files := form.File["images"]
		cse, result, err := h.svc.CreateCaseWithImages(c.Request.Context(), claims, in, files)
		if err != nil {
			writeCaseCreateError(c, err)
			return
		}
		h.audit.Event("case.create", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(cse.CaseID), audit.Detail("images", itoa(len(result.Images))), audit.Outcome("success"))
		resp := gin.H{"case_id": cse.CaseID, "images": result.Images}
		if result.AI != nil {
			resp["ai"] = result.AI
		}
		c.JSON(http.StatusCreated, resp)
		return
	}

	var in domain.CreateCaseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if claims.Role == domain.RoleDoctor {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one image required"})
		return
	}
	cse, err := h.svc.CreateCase(c.Request.Context(), claims, in)
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("case.create", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(cse.CaseID), audit.Outcome("success"))
	c.JSON(http.StatusCreated, gin.H{"case_id": cse.CaseID})
}

func (h *Handler) listCases(c *gin.Context) {
	claims := claimsFromContext(c)
	f := parseCaseFilter(c)
	cases, err := h.svc.ListCases(c.Request.Context(), claims, f)
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("case.list", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Detail("count", itoa(len(cases))), audit.Outcome("success"))
	c.JSON(http.StatusOK, cases)
}

func (h *Handler) getCase(c *gin.Context) {
	caseID := c.Param("caseId")
	claims := claimsFromContext(c)
	detail, err := h.svc.GetCase(c.Request.Context(), claims, caseID)
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("case.get", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(caseID), audit.Outcome("success"))
	c.JSON(http.StatusOK, detail)
}

func (h *Handler) updateCase(c *gin.Context) {
	caseID := c.Param("caseId")
	var in domain.PatchCaseInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	claims := claimsFromContext(c)
	cse, err := h.svc.UpdateCase(c.Request.Context(), claims, caseID, in)
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("case.update", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(caseID), audit.Outcome("success"))
	c.JSON(http.StatusOK, cse)
}

func (h *Handler) deleteCase(c *gin.Context) {
	caseID := c.Param("caseId")
	claims := claimsFromContext(c)
	if err := h.svc.DeleteCase(c.Request.Context(), claims, caseID); err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("case.delete", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(caseID), audit.Detail("mode", "soft"), audit.Outcome("success"))
	c.Status(http.StatusNoContent)
}

func (h *Handler) uploadCaseImages(c *gin.Context) {
	caseID := c.Param("caseId")
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, storage.MaxUploadRequestBytes)
	form, err := c.MultipartForm()
	if err != nil {
		if strings.Contains(err.Error(), "too large") || strings.Contains(err.Error(), "request body too large") {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request too large"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid multipart form"})
		return
	}
	files := form.File["images"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no images provided"})
		return
	}
	claims := claimsFromContext(c)
	result, err := h.svc.UploadCaseImages(c.Request.Context(), claims, caseID, files)
	if err != nil {
		writeImageError(c, err)
		return
	}
	h.audit.Event("case.images.upload", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(caseID), audit.Detail("count", itoa(len(result.Images))), audit.Outcome("success"))
	if result.AI != nil {
		h.audit.Event("case.ai.inference", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(caseID), audit.Detail("status", result.AI.Status), audit.Outcome(result.AI.Status))
	}
	c.JSON(http.StatusCreated, result)
}

func (h *Handler) deleteCaseImage(c *gin.Context) {
	caseID := c.Param("caseId")
	imageID := c.Param("imageId")
	claims := claimsFromContext(c)
	if err := h.svc.DeleteCaseImage(c.Request.Context(), claims, caseID, imageID); err != nil {
		writeImageError(c, err)
		return
	}
	h.audit.Event("case.images.delete", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(caseID), audit.Detail("image_id", imageID), audit.Detail("mode", "soft"), audit.Outcome("success"))
	c.Status(http.StatusNoContent)
}

func (h *Handler) listCaseImages(c *gin.Context) {
	caseID := c.Param("caseId")
	claims := claimsFromContext(c)
	images, err := h.svc.ListCaseImages(c.Request.Context(), claims, caseID)
	if err != nil {
		writeImageError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"images": images, "count": len(images)})
}

func (h *Handler) downloadCaseImagesArchive(c *gin.Context) {
	caseID := c.Param("caseId")
	claims := claimsFromContext(c)
	data, filename, err := h.svc.DownloadCaseImagesArchive(c.Request.Context(), claims, caseID)
	if err != nil {
		writeImageError(c, err)
		return
	}
	h.audit.Event("case.images.download", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(caseID), audit.Outcome("success"))
	setSensitiveResponseHeaders(c)
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Data(http.StatusOK, "application/zip", data)
}

func (h *Handler) serveCaseImageFile(c *gin.Context) {
	caseID := c.Param("caseId")
	imageID := c.Param("imageId")
	claims := claimsFromContext(c)
	data, mimeType, filename, err := h.svc.GetCaseImageFile(c.Request.Context(), claims, caseID, imageID)
	if err != nil {
		writeImageError(c, err)
		return
	}
	h.audit.Event("case.images.view", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(caseID), audit.Detail("image_id", imageID), audit.Outcome("success"))
	disposition := "inline"
	if c.Query("download") == "1" {
		disposition = "attachment"
	}
	setSensitiveResponseHeaders(c)
	c.Header("Content-Type", mimeType)
	c.Header("Content-Disposition", disposition+"; filename=\""+filename+"\"")
	c.Data(http.StatusOK, mimeType, data)
}

func writeImageError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, usecase.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	case errors.Is(err, usecase.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, storage.ErrFileTooLarge):
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large"})
	case errors.Is(err, storage.ErrTooManyFiles):
		c.JSON(http.StatusBadRequest, gin.H{"error": "too many files"})
	case errors.Is(err, storage.ErrInvalidFileType):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file type"})
	case strings.Contains(err.Error(), "http: request body too large"):
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request too large"})
	default:
		writeError(c, err)
	}
}

func (h *Handler) createSurvey(c *gin.Context) {
	var in domain.CreateSurveyInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	claims := claimsFromContext(c)
	survey, err := h.svc.CreateSurvey(c.Request.Context(), claims, in)
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("survey.create", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Resource(survey.ID.String()), audit.Outcome("success"))
	c.JSON(http.StatusCreated, survey)
}

func (h *Handler) listSurveys(c *gin.Context) {
	claims := claimsFromContext(c)
	surveys, err := h.svc.ListSurveys(c.Request.Context(), claims)
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("survey.list", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Detail("count", itoa(len(surveys))), audit.Outcome("success"))
	c.JSON(http.StatusOK, surveys)
}

func (h *Handler) weeklyReport(c *gin.Context) {
	claims := claimsFromContext(c)
	rows, err := h.svc.WeeklyReport(c.Request.Context(), claims, parseCaseFilter(c))
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("report.weekly", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Detail("rows", itoa(len(rows))), audit.Outcome("success"))
	c.JSON(http.StatusOK, rows)
}

func (h *Handler) stageReport(c *gin.Context) {
	claims := claimsFromContext(c)
	rows, err := h.svc.StageReport(c.Request.Context(), claims, parseCaseFilter(c))
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("report.stages", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Outcome("success"))
	c.JSON(http.StatusOK, rows)
}

func (h *Handler) hospitalReport(c *gin.Context) {
	claims := claimsFromContext(c)
	rows, err := h.svc.HospitalReport(c.Request.Context(), claims, parseCaseFilter(c))
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("report.hospitals", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Outcome("success"))
	c.JSON(http.StatusOK, rows)
}

func (h *Handler) downloadExcel(c *gin.Context) {
	claims := claimsFromContext(c)
	if err := h.svc.RequireCoordinatorExport(c.Request.Context(), claims); err != nil {
		h.audit.Event("report.excel", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Outcome("forbidden"))
		writeError(c, err)
		return
	}
	cases, surveys, err := h.svc.ReportData(c.Request.Context(), claims, parseCaseFilter(c))
	if err != nil {
		writeError(c, err)
		return
	}
	data, err := excel.BuildReport(cases, surveys)
	if err != nil {
		slog.Error("excel build failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	h.audit.Event("report.excel", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Detail("cases", itoa(len(cases))), audit.Outcome("success"))
	setSensitiveResponseHeaders(c)
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", "attachment; filename=\""+excel.Filename()+"\"")
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data)
}

func (h *Handler) downloadSurveyExcel(c *gin.Context) {
	claims := claimsFromContext(c)
	data, filename, err := h.svc.GenerateSurveyExcelReport(c.Request.Context(), claims)
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("report.survey_excel", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Outcome("success"))
	setSensitiveResponseHeaders(c)
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data)
}

func (h *Handler) downloadTrainingExport(c *gin.Context) {
	claims := claimsFromContext(c)
	data, filename, err := h.svc.DownloadTrainingExport(c.Request.Context(), claims, parseCaseFilter(c))
	if err != nil {
		writeError(c, err)
		return
	}
	h.audit.Event("report.training_export", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Outcome("success"))
	setSensitiveResponseHeaders(c)
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Data(http.StatusOK, "application/zip", data)
}

func (h *Handler) listExcelExports(c *gin.Context) {
	claims := claimsFromContext(c)
	if err := h.svc.RequireCoordinatorExport(c.Request.Context(), claims); err != nil {
		writeError(c, err)
		return
	}
	entries, err := h.svc.ListArchivedExcelExports()
	if err != nil {
		slog.Error("list excel exports failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	h.audit.Event("report.exports.list", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Detail("count", itoa(len(entries))), audit.Outcome("success"))
	c.JSON(http.StatusOK, entries)
}

func (h *Handler) downloadExcelExport(c *gin.Context) {
	claims := claimsFromContext(c)
	if err := h.svc.RequireCoordinatorExport(c.Request.Context(), claims); err != nil {
		writeError(c, err)
		return
	}
	filename := c.Param("filename")
	data, err := h.svc.ReadArchivedExcelExport(filename)
	if err != nil {
		if errors.Is(err, exportarchive.ErrNotFound) || errors.Is(err, exportarchive.ErrInvalidFilename) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		slog.Error("read excel export failed", "error", err, "file", filename)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	h.audit.Event("report.exports.download", audit.UserID(claims.UserID), audit.UserRole(string(claims.Role)), audit.Detail("file", filename), audit.Outcome("success"))
	setSensitiveResponseHeaders(c)
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", data)
}

func parseCaseFilter(c *gin.Context) domain.CaseFilter {
	return domain.CaseFilter{
		Hospital: c.Query("hospital"),
		DateFrom: c.Query("date_from"),
		DateTo:   c.Query("date_to"),
		Patient:  c.Query("patient"),
		Stage:    c.Query("stage"),
		Aprop:    c.Query("aprop") == "1",
	}
}

func writeAuthError(c *gin.Context, err error) {
	if errors.Is(err, usecase.ErrUnauthorized) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	writeError(c, err)
}

func writeCaseCreateError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, usecase.ErrImagesRequired):
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one image required"})
	case errors.Is(err, storage.ErrFileTooLarge):
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large"})
	case errors.Is(err, storage.ErrTooManyFiles):
		c.JSON(http.StatusBadRequest, gin.H{"error": "too many files"})
	case errors.Is(err, storage.ErrInvalidFileType):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file type"})
	case strings.Contains(err.Error(), "http: request body too large"):
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "request too large"})
	default:
		writeError(c, err)
	}
}

func writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, usecase.ErrUnauthorized):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
	case errors.Is(err, usecase.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, usecase.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	case errors.Is(err, usecase.ErrImagesRequired):
		c.JSON(http.StatusBadRequest, gin.H{"error": "at least one image required"})
	default:
		slog.Error("request failed", "error", err, "path", c.FullPath())
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}

const claimsKey = "claims"

func (h *Handler) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")
		claims, err := h.svc.ParseAccessToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set(claimsKey, claims)
		c.Next()
	}
}

func claimsFromContext(c *gin.Context) *usecase.Claims {
	val, _ := c.Get(claimsKey)
	claims, _ := val.(*usecase.Claims)
	return claims
}

func (h *Handler) clientIP(c *gin.Context) string {
	return trustedClientIP(c, h.trustedProxyIPs)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
