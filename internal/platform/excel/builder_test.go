package excel_test

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"github.com/eyeeyeai/pilot/internal/domain"
	"github.com/eyeeyeai/pilot/internal/platform/excel"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"gorm.io/datatypes"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
}

func sampleCases() []domain.Case {
	return []domain.Case{
		{
			CaseID:      "EEA-2026-001",
			Date:        "2026-06-25",
			Hospital:    domain.PilotHospitals[0],
			Doctor:      "Test",
			MotherSurname: "Иванова",
			ChildSurname:  "Петрова",
			GA:          "28+3",
			BW:          1100,
			Stage:       "Ст. 3",
			PlusDisease: "Есть",
			Aprop:       "Да (AP-ROP)",
		},
		{
			CaseID:      "EEA-2026-002",
			Date:        "2026-06-26",
			Hospital:    domain.PilotHospitals[0],
			Doctor:      "Test",
			MotherSurname: "Смагулова",
			ChildSurname:  "Ким",
			GA:          "30+1",
			BW:          1200,
			Stage:       "Ст. 1",
			PlusDisease: "Нет",
			Aprop:       "Нет",
		},
	}
}

func sampleSurveys() []domain.Survey {
	return []domain.Survey{
		{
			ID:          uuid.New(),
			Date:        "2026-06-25",
			Hospital:    domain.PilotHospitals[0],
			Scores:      datatypes.JSON([]byte(`[5,4,5,5,4,4,4,3,4,3,4,5]`)),
			UXAvg:       4.6,
			ClinicalAvg: 3.75,
			ProcessAvg:  4,
			TotalAvg:    4.1,
			Comment:     "ok",
		},
	}
}

func openReport(t *testing.T) (*excelize.File, []byte) {
	t.Helper()
	data, err := excel.BuildReport(sampleCases(), sampleSurveys())
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 5000 {
		t.Fatalf("xlsx too small: %d bytes", len(data))
	}
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	return f, data
}

func TestBuildReport(t *testing.T) {
	_, data := openReport(t)
	if len(data) < 5000 {
		t.Fatalf("xlsx too small: %d bytes", len(data))
	}
}

func TestBuildSurveyReport(t *testing.T) {
	data, err := excel.BuildSurveyReport(sampleSurveys())
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 3000 {
		t.Fatalf("survey xlsx too small: %d bytes", len(data))
	}
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if f.GetSheetName(0) != "Продуктовые метрики" {
		t.Fatalf("sheet name = %q", f.GetSheetName(0))
	}
	got, err := f.GetCellValue("Продуктовые метрики", "A2")
	if err != nil || got != "2026-06-25" {
		t.Fatalf("date cell = %q err=%v", got, err)
	}
}

func TestSheetOrder(t *testing.T) {
	f, _ := openReport(t)
	defer f.Close()

	got := f.GetSheetList()
	if len(got) != len(excel.SheetOrder) {
		t.Fatalf("sheet count: got %d want %d", len(got), len(excel.SheetOrder))
	}
	for i, want := range excel.SheetOrder {
		if got[i] != want {
			t.Errorf("sheet[%d]: got %q want %q", i, got[i], want)
		}
	}
}

func TestWeeklyHeaders(t *testing.T) {
	f, _ := openReport(t)
	defer f.Close()

	for i, want := range excel.WeeklyHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		got, err := f.GetCellValue(excel.SheetOrder[0], cell)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("header[%d]: got %q want %q", i, got, want)
		}
	}
}

func TestWeeklySheetApropOnlyRedFill(t *testing.T) {
	cases := []domain.Case{
		{
			CaseID: "EEA-2026-001", Date: "2026-06-25", Hospital: domain.PilotHospitals[0],
			Doctor: "Test", MotherSurname: "A", ChildSurname: "B", Stage: "Ст. 4", Aprop: "Нет",
		},
		{
			CaseID: "EEA-2026-002", Date: "2026-06-26", Hospital: domain.PilotHospitals[0],
			Doctor: "Test", MotherSurname: "C", ChildSurname: "D", Stage: "Ст. 3", Aprop: "Да (AP-ROP)",
		},
	}
	data, err := excel.BuildReport(cases, nil)
	if err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	sheet := excel.SheetOrder[0]

	row2Style, err := f.GetCellStyle(sheet, "A2")
	if err != nil {
		t.Fatal(err)
	}
	style2, err := f.GetStyle(row2Style)
	if err != nil {
		t.Fatal(err)
	}
	if len(style2.Fill.Color) > 0 && strings.TrimPrefix(strings.ToUpper(style2.Fill.Color[0]), "#") == "FECACA" {
		t.Error("St. 4 without AP-ROP should not have red fill")
	}

	row3Style, err := f.GetCellStyle(sheet, "A3")
	if err != nil {
		t.Fatal(err)
	}
	style3, err := f.GetStyle(row3Style)
	if err != nil {
		t.Fatal(err)
	}
	if len(style3.Fill.Color) == 0 || strings.TrimPrefix(strings.ToUpper(style3.Fill.Color[0]), "#") != "FECACA" {
		t.Errorf("AP-ROP row should have red fill, got fill %+v", style3.Fill)
	}
}

func TestSurveySummaryRowUsesAverageFormulas(t *testing.T) {
	f, _ := openReport(t)
	defer f.Close()

	sheet := excel.SheetOrder[3]
	rows, err := f.GetRows(sheet)
	if err != nil {
		t.Fatal(err)
	}
	var summaryRow int
	for i, row := range rows {
		if len(row) > 0 && row[0] == "СРЕДНЕЕ" {
			summaryRow = i + 1
			break
		}
	}
	if summaryRow == 0 {
		t.Fatal("СРЕДНЕЕ row not found on survey sheet")
	}
	for _, col := range []string{"O", "P", "Q", "R"} {
		addr := col + strconv.Itoa(summaryRow)
		formula, err := f.GetCellFormula(sheet, addr)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(formula, "AVERAGE(") {
			t.Errorf("cell %s: expected AVERAGE formula, got %q", addr, formula)
		}
	}
}

func TestStagesTotalUsesSumFormulas(t *testing.T) {
	f, _ := openReport(t)
	defer f.Close()

	sheet := excel.SheetOrder[1]
	listRows, err := f.GetRows(sheet)
	if err != nil {
		t.Fatal(err)
	}
	var totalExcelRow int
	for i, row := range listRows {
		if len(row) > 0 && row[0] == "ИТОГО" {
			totalExcelRow = i + 1
			break
		}
	}
	if totalExcelRow == 0 {
		t.Fatal("ИТОГО row not found")
	}
	for _, col := range []string{"B", "C", "D"} {
		addr := col + strconv.Itoa(totalExcelRow)
		formula, err := f.GetCellFormula(sheet, addr)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(formula, "SUM(") {
			t.Errorf("cell %s: expected SUM formula, got %q", addr, formula)
		}
	}
}

func TestTemplateHasExpectedSheets(t *testing.T) {
	path := filepath.Join(repoRoot(t), "testdata", "weekly_report_template.xlsx")
	if _, err := os.Stat(path); err != nil {
		t.Skipf("template xlsx not found: %v", err)
	}
	f, err := excelize.OpenFile(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	required := map[string]bool{
		"Еженедельный отчёт":  true,
		"Продуктовые метрики": true,
		"Стадии и гестация":   true,
		"Сводка по больницам": true,
		"Инструкция":          true,
	}
	for _, sheet := range f.GetSheetList() {
		delete(required, sheet)
	}
	if len(required) > 0 {
		var missing []string
		for s := range required {
			missing = append(missing, s)
		}
		t.Errorf("template missing sheets: %v", missing)
	}

	templateHeaders, err := f.GetRows("Еженедельный отчёт")
	if err != nil || len(templateHeaders) == 0 {
		t.Fatal("template weekly headers missing")
	}
	overlap := 0
	for _, th := range templateHeaders[0] {
		for _, gh := range excel.WeeklyHeaders {
			if th == gh || strings.Contains(gh, th) || strings.Contains(th, gh) {
				overlap++
				break
			}
		}
	}
	if overlap < 5 {
		t.Errorf("expected meaningful header overlap between template and generated weekly sheet, got %d", overlap)
	}
}
