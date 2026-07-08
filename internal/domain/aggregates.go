package domain

import (
	"strconv"
	"strings"
)

type StageRow struct {
	Stage       string   `json:"stage"`
	Count       int      `json:"count"`
	PlusDisease int      `json:"plus_disease"`
	Aggressive  int      `json:"aggressive"`
	AvgGA       *float64 `json:"avg_ga"`
	AvgBW       *float64 `json:"avg_bw"`
	AvgPH       *float64 `json:"avg_ph"`
}

type HospitalRow struct {
	Hospital    string `json:"hospital"`
	Total       int    `json:"total"`
	ROPDetected int    `json:"rop_detected"`
	Stages12    int    `json:"stages_1_2"`
	Stages35    int    `json:"stages_3_5"`
	PlusDisease int    `json:"plus_disease"`
	Aggressive  int    `json:"aggressive"`
	Doubtful    int    `json:"doubtful"`
}

type WeeklyRow struct {
	CaseID         string  `json:"case_id"`
	Date           string  `json:"date"`
	Hospital       string  `json:"hospital"`
	Doctor         string  `json:"doctor"`
	PatientLabel   string  `json:"patient_label"`
	MotherSurname  string  `json:"mother_surname"`
	ChildSurname   string  `json:"child_surname"`
	GA             string  `json:"ga"`
	BW             int     `json:"bw"`
	PCA            int     `json:"pca"`
	PH             string  `json:"ph"`
	Eye            string  `json:"etiology"`
	Visit          string  `json:"visit"`
	Stage          string  `json:"stage"`
	PlusDisease    string  `json:"plus_disease"`
	RopForm        string  `json:"rop_form"`
	PreDiag        string  `json:"pre_diag"`
	AIMatch        *string `json:"ai_match"`
	Aprop          string  `json:"aprop"`
	Confidence     string  `json:"confidence"`
	Recommendation string  `json:"recommendation"`
	Doubtful       string  `json:"doubtful"`
	Notes          string  `json:"notes"`
	ImageCount     int     `json:"image_count"`
}

func HasHighRisk(steatosis string) bool {
	return steatosis == "Умеренный" || steatosis == "Выраженный"
}

func IsReferredToHepatologist(recommendation string) bool {
	return recommendation == "Направление к гепатологу" ||
		strings.Contains(strings.ToLower(recommendation), "гепатолог")
}

func IsDoubtful(confidence string) bool {
	return confidence == "Сомневаюсь"
}

func IsNormalFinding(c Case) bool {
	if c.Stage == "F0" || c.PreDiag == "Норма" {
		return true
	}
	return c.Stage == "" || c.Stage == "Не определено"
}

func IsStageF01(stage string) bool {
	return stage == "F0" || stage == "F1"
}

func IsStageF23(stage string) bool {
	return stage == "F2" || stage == "F3"
}

func IsStageF4(stage string) bool {
	return stage == "F4"
}

func ParseAge(age string) (float64, bool) {
	age = strings.TrimSpace(age)
	if age == "" {
		return 0, false
	}
	age = strings.ReplaceAll(age, ",", ".")
	v, err := strconv.ParseFloat(age, 64)
	return v, err == nil && v > 0
}

func HospitalMatches(caseHospital, pilotHospital string) bool {
	if caseHospital == "" {
		return false
	}
	if caseHospital == pilotHospital {
		return true
	}
	prefix := pilotHospital
	if len(prefix) > 12 {
		prefix = prefix[:12]
	}
	return strings.Contains(caseHospital, prefix)
}

func AvgFloat(vals []float64) *float64 {
	if len(vals) == 0 {
		return nil
	}
	sum := 0.0
	for _, v := range vals {
		sum += v
	}
	avg := sum / float64(len(vals))
	return &avg
}

func ComputeStageRows(cases []Case) []StageRow {
	rows := make([]StageRow, 0, len(StageOrder)+1)
	total := StageRow{Stage: "ИТОГО"}

	for _, stage := range StageOrder {
		var matched []Case
		for _, c := range cases {
			if c.Stage == stage {
				matched = append(matched, c)
			}
		}
		row := aggregateStageRow(stage, matched)
		rows = append(rows, row)
		total.Count += row.Count
		total.PlusDisease += row.PlusDisease
		total.Aggressive += row.Aggressive
	}
	rows = append(rows, total)
	return rows
}

func aggregateStageRow(stage string, cases []Case) StageRow {
	var ageVals []float64
	highRisk := 0
	referred := 0

	for _, c := range cases {
		if HasHighRisk(c.PlusDisease) {
			highRisk++
		}
		if IsReferredToHepatologist(c.Recommendation) {
			referred++
		}
		if v, ok := ParseAge(c.GA); ok {
			ageVals = append(ageVals, v)
		}
	}

	return StageRow{
		Stage:       stage,
		Count:       len(cases),
		PlusDisease: highRisk,
		Aggressive:  referred,
		AvgGA:       AvgFloat(ageVals),
	}
}

func ComputeHospitalRows(cases []Case) []HospitalRow {
	rows := make([]HospitalRow, 0, len(PilotHospitals)+1)
	total := HospitalRow{Hospital: "ИТОГО"}

	for _, h := range PilotHospitals {
		var matched []Case
		for _, c := range cases {
			if HospitalMatches(c.Hospital, h) {
				matched = append(matched, c)
			}
		}
		row := aggregateHospitalRow(h, matched)
		rows = append(rows, row)
		total.Total += row.Total
		total.ROPDetected += row.ROPDetected
		total.Stages12 += row.Stages12
		total.Stages35 += row.Stages35
		total.PlusDisease += row.PlusDisease
		total.Aggressive += row.Aggressive
		total.Doubtful += row.Doubtful
	}
	rows = append(rows, total)
	return rows
}

func aggregateHospitalRow(hospital string, cases []Case) HospitalRow {
	row := HospitalRow{Hospital: hospital, Total: len(cases)}
	for _, c := range cases {
		if IsNormalFinding(c) {
			row.ROPDetected++
		}
		if IsStageF01(c.Stage) {
			row.Stages12++
		}
		if IsStageF23(c.Stage) {
			row.Stages35++
		}
		if IsStageF4(c.Stage) {
			row.PlusDisease++
		}
		if IsReferredToHepatologist(c.Recommendation) {
			row.Aggressive++
		}
		if IsDoubtful(c.Confidence) {
			row.Doubtful++
		}
	}
	return row
}

func ToWeeklyRows(cases []Case, imageCounts map[string]int) []WeeklyRow {
	out := make([]WeeklyRow, len(cases))
	for i, c := range cases {
		out[i] = WeeklyRow{
			CaseID:         c.CaseID,
			Date:           c.Date,
			Hospital:       c.Hospital,
			Doctor:         c.Doctor,
			PatientLabel:   PatientLabel(c.MotherSurname, c.ChildSurname),
			MotherSurname:  c.MotherSurname,
			ChildSurname:   c.ChildSurname,
			GA:             c.GA,
			BW:             c.BW,
			PCA:            c.PCA,
			PH:             c.PH,
			Eye:            c.Eye,
			Visit:          c.Visit,
			Stage:          c.Stage,
			PlusDisease:    c.PlusDisease,
			RopForm:        c.RopForm,
			PreDiag:        c.PreDiag,
			AIMatch:        c.AIMatch,
			Aprop:          c.Aprop,
			Confidence:     c.Confidence,
			Recommendation: c.Recommendation,
			Doubtful:       c.Doubtful,
			Notes:          c.Notes,
			ImageCount:     imageCounts[c.CaseID],
		}
	}
	return out
}
