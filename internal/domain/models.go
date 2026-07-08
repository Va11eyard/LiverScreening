package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Role string

const (
	RoleDoctor      Role = "doctor"
	RoleCoordinator Role = "coordinator"
	RoleAdmin       Role = "admin"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	Name         string    `gorm:"not null" json:"name"`
	Role         Role      `gorm:"type:text;not null" json:"role"`
	Hospital     string    `json:"hospital,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Case struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey" json:"-"`
	CaseID         string    `gorm:"uniqueIndex;not null" json:"case_id"`
	UserID         uuid.UUID `gorm:"type:uuid;index;not null" json:"-"`
	Date           string    `gorm:"not null;index" json:"date"`
	Hospital       string    `gorm:"not null;index" json:"hospital"`
	Doctor         string    `gorm:"not null" json:"doctor"`
	MotherSurname  string    `gorm:"column:mother_surname;index" json:"motherSurname"`
	ChildSurname   string    `gorm:"column:child_surname;index" json:"childSurname"`
	PatientID      string    `gorm:"column:patient_id" json:"-"` // legacy column; kept for existing DB schemas
	GA             string    `json:"ga"`
	BW             int       `json:"bw"`
	PCA            int       `json:"pca"`
	PH             string    `json:"ph"`
	Eye            string    `json:"eye"`
	Visit          string    `json:"visit"`
	RiskFactors    string    `json:"riskFactors"`
	Camera         string    `json:"camera"`
	ImageQuality   string    `json:"imageQuality"`
	AvascColor     string    `json:"avascColor"`
	AvascHours     string    `json:"avascHours"`
	AvascLoc       string    `json:"avascLoc"`
	Zone           string    `json:"zone"`
	ArtDiam        string    `json:"artDiam"`
	ArtCourse      string    `json:"artCourse"`
	Veins          string    `json:"veins"`
	AvpDZN         string    `json:"avpDZN"`
	RopForm        string    `json:"ropForm"`
	Stage          string    `gorm:"index" json:"stage"`
	PlusDisease    string    `json:"plusDisease"`
	Aprop          string    `json:"aprop"`
	PreDiag        string    `json:"preDiag"`
	Confidence     string    `json:"confidence"`
	Recommendation string    `json:"recommendation"`
	Doubtful       string    `json:"doubtful"`
	Notes          string    `json:"notes"`
	AIMatch        *string        `json:"aiMatch,omitempty"`
	AISnapshot     datatypes.JSON `gorm:"type:jsonb" json:"ai_snapshot,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

type CaseDetail struct {
	Case
	Images []CaseImageInfo `json:"images"`
}

type UploadCaseImagesResult struct {
	Images []CaseImageInfo `json:"images"`
	AI     *UploadAIBlock  `json:"ai,omitempty"`
}

type UploadAIBlock struct {
	Status      string                 `json:"status"`
	Suggestions map[string]string      `json:"suggestions,omitempty"`
	AIMatch     string                 `json:"ai_match,omitempty"`
	Error       string                 `json:"error,omitempty"`
}

type CaseImage struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	CaseID       string    `gorm:"index;not null" json:"case_id"`
	UserID       uuid.UUID `gorm:"type:uuid;index;not null" json:"-"`
	OriginalName string    `gorm:"not null" json:"original_name"`
	StoredName   string    `gorm:"not null" json:"-"`
	MimeType     string    `json:"mime_type"`
	SizeBytes    int64          `json:"size_bytes"`
	CreatedAt    time.Time      `json:"created_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

type CaseImageInfo struct {
	ID           string    `json:"id"`
	OriginalName string    `json:"original_name"`
	MimeType     string    `json:"mime_type"`
	SizeBytes    int64     `json:"size_bytes"`
	CreatedAt    time.Time `json:"created_at"`
}

func (img CaseImage) ToInfo() CaseImageInfo {
	return CaseImageInfo{
		ID:           img.ID.String(),
		OriginalName: img.OriginalName,
		MimeType:     img.MimeType,
		SizeBytes:    img.SizeBytes,
		CreatedAt:    img.CreatedAt,
	}
}

type Survey struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	UserID      uuid.UUID      `gorm:"type:uuid;index;not null" json:"-"`
	Date        string         `gorm:"not null;index" json:"date"`
	Hospital    string         `gorm:"not null" json:"hospital"`
	Scores      datatypes.JSON `gorm:"type:jsonb;not null" json:"scores"`
	UXAvg       float64        `json:"ux_avg"`
	ClinicalAvg float64        `json:"clinical_avg"`
	ProcessAvg  float64        `json:"process_avg"`
	TotalAvg    float64        `json:"total_avg"`
	Comment     string         `json:"comment"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type CreateCaseInput struct {
	Date           string `json:"date" binding:"required"`
	Hospital       string `json:"hospital" binding:"required"`
	Doctor         string `json:"doctor" binding:"required"`
	MotherSurname  string `json:"motherSurname" binding:"required"`
	ChildSurname   string `json:"childSurname" binding:"required"`
	GA             string  `json:"ga"`
	BW             int     `json:"bw"`
	PCA            int     `json:"pca"`
	PH             string  `json:"ph"`
	Eye            string  `json:"eye"`
	Visit          string  `json:"visit"`
	RiskFactors    string  `json:"riskFactors"`
	Camera         string  `json:"camera"`
	ImageQuality   string  `json:"imageQuality"`
	AvascColor     string  `json:"avascColor"`
	AvascHours     string  `json:"avascHours"`
	AvascLoc       string  `json:"avascLoc"`
	Zone           string  `json:"zone"`
	ArtDiam        string  `json:"artDiam"`
	ArtCourse      string  `json:"artCourse"`
	Veins          string  `json:"veins"`
	AvpDZN         string  `json:"avpDZN"`
	RopForm        string  `json:"ropForm"`
	Stage          string  `json:"stage" binding:"required"`
	PlusDisease    string  `json:"plusDisease"`
	Aprop          string  `json:"aprop"`
	PreDiag        string  `json:"preDiag"`
	Confidence     string  `json:"confidence"`
	Recommendation string  `json:"recommendation"`
	Doubtful       string  `json:"doubtful"`
	Notes          string  `json:"notes"`
	AIMatch        *string `json:"aiMatch"`
}

// PatchCaseInput is the only fields doctors may update on an existing case.
type PatchCaseInput struct {
	Stage   string `json:"stage"`
	PreDiag string `json:"preDiag"`
	Notes   string `json:"notes"`
}

type UpdateCaseInput struct {
	Date           string `json:"date"`
	Hospital       string `json:"hospital"`
	Doctor         string `json:"doctor"`
	MotherSurname  string `json:"motherSurname"`
	ChildSurname   string `json:"childSurname"`
	GA             string `json:"ga"`
	BW             int    `json:"bw"`
	PCA            int    `json:"pca"`
	PH             string `json:"ph"`
	Eye            string `json:"eye"`
	Visit          string `json:"visit"`
	RiskFactors    string `json:"riskFactors"`
	Camera         string `json:"camera"`
	ImageQuality   string `json:"imageQuality"`
	AvascColor     string `json:"avascColor"`
	AvascHours     string `json:"avascHours"`
	AvascLoc       string `json:"avascLoc"`
	Zone           string `json:"zone"`
	ArtDiam        string `json:"artDiam"`
	ArtCourse      string `json:"artCourse"`
	Veins          string `json:"veins"`
	AvpDZN         string `json:"avpDZN"`
	RopForm        string `json:"ropForm"`
	Stage          string `json:"stage"`
	PlusDisease    string `json:"plusDisease"`
	Aprop          string `json:"aprop"`
	PreDiag        string `json:"preDiag"`
	Confidence     string `json:"confidence"`
	Recommendation string `json:"recommendation"`
	Doubtful       string `json:"doubtful"`
	Notes          string `json:"notes"`
}

type CreateSurveyInput struct {
	Date        string  `json:"date" binding:"required"`
	Hospital    string  `json:"hospital" binding:"required"`
	Scores      []int   `json:"scores" binding:"required,len=12"`
	UXAvg       float64 `json:"ux_avg"`
	ClinicalAvg float64 `json:"clinical_avg"`
	ProcessAvg  float64 `json:"process_avg"`
	TotalAvg    float64 `json:"total_avg"`
	Comment     string  `json:"comment"`
}

type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

type AuthUser struct {
	ID       uuid.UUID `json:"id"`
	Email    string    `json:"email"`
	Name     string    `json:"name"`
	Role     Role      `json:"role"`
	Hospital string    `json:"hospital,omitempty"`
}

type LoginResponse struct {
	Tokens TokenPair `json:"tokens"`
	User   AuthUser  `json:"user"`
}

type CaseFilter struct {
	Hospital string
	DateFrom string
	DateTo   string
	Patient  string
	Stage    string
	Aprop    bool
	UserID   *uuid.UUID
}
