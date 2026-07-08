package ai

import "time"

type InferenceRequest struct {
	CaseID    string `json:"case_id"`
	PatientID string `json:"patient_id,omitempty"`
	Eye       string `json:"eye,omitempty"`
	Etiology  string `json:"etiology,omitempty"`
	Age       string `json:"age,omitempty"`
	ALT       int    `json:"alt,omitempty"`
	AST       int    `json:"ast,omitempty"`
	Platelets int    `json:"platelets,omitempty"`
	HBV       string `json:"hbv,omitempty"`
}

type InferenceResponse struct {
	Stage       string         `json:"stage"`
	PlusDisease string         `json:"plus_disease"`
	AvascColor  string         `json:"avasc_color"`
	Zone        string         `json:"zone"`
	RopForm     string         `json:"rop_form"`
	PreDiag     string         `json:"pre_diag"`
	Confidence  string         `json:"confidence"`
	Aprop       string         `json:"aprop"`
	Fib4        string         `json:"fib4,omitempty"`
	Apri        string         `json:"apri,omitempty"`
	RiskTier    string         `json:"risk_tier,omitempty"`
	Explanation map[string]any `json:"explanation,omitempty"`
	Findings    []Finding      `json:"findings,omitempty"`
	Raw         map[string]any `json:"-"`
}

type Finding struct {
	Type       string             `json:"type"`
	Region     map[string]float64 `json:"region"`
	Confidence float64            `json:"confidence"`
}

type Snapshot struct {
	Status      string            `json:"status"`
	Suggestions InferenceResponse `json:"suggestions,omitempty"`
	AnalyzedAt  time.Time         `json:"analyzed_at"`
	Error       string            `json:"error,omitempty"`
}

type UploadBlock struct {
	Status      string            `json:"status"`
	Suggestions *InferenceResponse `json:"suggestions,omitempty"`
	AIMatch     string            `json:"ai_match,omitempty"`
	Error       string            `json:"error,omitempty"`
}
