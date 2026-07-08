package domain

import (
	"regexp"
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
	CaseID      string  `json:"case_id"`
	Date        string  `json:"date"`
	Hospital    string  `json:"hospital"`
	Doctor      string  `json:"doctor"`
	PatientLabel string  `json:"patient_label"`
	MotherSurname string `json:"mother_surname"`
	ChildSurname  string `json:"child_surname"`
	GA          string  `json:"ga"`
	BW          int     `json:"bw"`
	PCA         int     `json:"pca"`
	PH          string  `json:"ph"`
	Stage       string  `json:"stage"`
	PlusDisease string  `json:"plus_disease"`
	RopForm     string  `json:"rop_form"`
	PreDiag     string  `json:"pre_diag"`
	AIMatch     *string `json:"ai_match"`
	Aprop       string  `json:"aprop"`
	Doubtful    string  `json:"doubtful"`
	Notes       string  `json:"notes"`
	ImageCount  int     `json:"image_count"`
}

func HasPlusDisease(v string) bool {
	return strings.Contains(v, "Есть")
}

func IsAggressive(v string) bool {
	return v == "Да (AP-ROP)"
}

func IsDoubtful(v string) bool {
	return v == "Да"
}

func HasROP(stage string) bool {
	return stage != "" && stage != "Нет РН"
}

func IsStage12(stage string) bool {
	return stage == "Ст. 1" || stage == "Ст. 2"
}

func IsStage35(stage string) bool {
	return stage == "Ст. 3" || stage == "Ст. 4" || stage == "Ст. 5"
}

var gaRe = regexp.MustCompile(`^(\d+)(?:\+(\d+))?$`)

func ParseGAWeeks(ga string) (float64, bool) {
	ga = strings.TrimSpace(ga)
	if ga == "" {
		return 0, false
	}
	m := gaRe.FindStringSubmatch(ga)
	if m == nil {
		if w, err := strconv.ParseFloat(ga, 64); err == nil {
			return w, true
		}
		return 0, false
	}
	weeks, _ := strconv.Atoi(m[1])
	days := 0
	if m[2] != "" {
		days, _ = strconv.Atoi(m[2])
	}
	return float64(weeks) + float64(days)/7.0, true
}

var phRe = regexp.MustCompile(`([\d.]+)`)

func ParsePH(ph string) (float64, bool) {
	m := phRe.FindStringSubmatch(ph)
	if m == nil {
		return 0, false
	}
	v, err := strconv.ParseFloat(m[1], 64)
	return v, err == nil
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

func AvgInt(vals []int) *float64 {
	if len(vals) == 0 {
		return nil
	}
	sum := 0
	for _, v := range vals {
		sum += v
	}
	avg := float64(sum) / float64(len(vals))
	return &avg
}

func ComputeStageRows(cases []Case) []StageRow {
	rows := make([]StageRow, 0, len(StageOrder)+1)
	total := StageRow{Stage: "ИТОГО"}

	for _, stage := range StageOrder {
		var matched []Case
		for _, c := range cases {
			if stage == "AP-ROP" {
				if c.Aprop == "Да (AP-ROP)" || strings.Contains(c.RopForm, "AP-ROP") {
					matched = append(matched, c)
				}
				continue
			}
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
	var gaVals []float64
	var bwVals []int
	var phVals []float64
	plus := 0
	aggr := 0

	for _, c := range cases {
		if HasPlusDisease(c.PlusDisease) {
			plus++
		}
		if IsAggressive(c.Aprop) {
			aggr++
		}
		if v, ok := ParseGAWeeks(c.GA); ok {
			gaVals = append(gaVals, v)
		}
		if c.BW > 0 {
			bwVals = append(bwVals, c.BW)
		}
		if v, ok := ParsePH(c.PH); ok {
			phVals = append(phVals, v)
		}
	}

	return StageRow{
		Stage:       stage,
		Count:       len(cases),
		PlusDisease: plus,
		Aggressive:  aggr,
		AvgGA:       AvgFloat(gaVals),
		AvgBW:       AvgInt(bwVals),
		AvgPH:       AvgFloat(phVals),
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
		if HasROP(c.Stage) {
			row.ROPDetected++
		}
		if IsStage12(c.Stage) {
			row.Stages12++
		}
		if IsStage35(c.Stage) {
			row.Stages35++
		}
		if HasPlusDisease(c.PlusDisease) {
			row.PlusDisease++
		}
		if IsAggressive(c.Aprop) {
			row.Aggressive++
		}
		if IsDoubtful(c.Doubtful) {
			row.Doubtful++
		}
	}
	return row
}

func ToWeeklyRows(cases []Case, imageCounts map[string]int) []WeeklyRow {
	out := make([]WeeklyRow, len(cases))
	for i, c := range cases {
		out[i] = WeeklyRow{
			CaseID:      c.CaseID,
			Date:        c.Date,
			Hospital:    c.Hospital,
			Doctor:      c.Doctor,
			PatientLabel:  PatientLabel(c.MotherSurname, c.ChildSurname),
			MotherSurname: c.MotherSurname,
			ChildSurname:  c.ChildSurname,
			GA:          c.GA,
			BW:          c.BW,
			PCA:         c.PCA,
			PH:          c.PH,
			Stage:       c.Stage,
			PlusDisease: c.PlusDisease,
			RopForm:     c.RopForm,
			PreDiag:     c.PreDiag,
			AIMatch:     c.AIMatch,
			Aprop:       c.Aprop,
			Doubtful:    c.Doubtful,
			Notes:       c.Notes,
			ImageCount:  imageCounts[c.CaseID],
		}
	}
	return out
}
