package excel

import (
	"bytes"
	"fmt"
	"strconv"
	"time"

	"github.com/eyeeyeai/pilot/internal/domain"
	"github.com/eyeeyeai/pilot/internal/repository/postgres"
	"github.com/xuri/excelize/v2"
)

const (
	sheetWeekly    = "Еженедельный отчёт"
	sheetStages    = "Стадии фиброза"
	sheetHospitals = "Сводка по больницам"
	sheetSurvey    = "Продуктовые метрики"
	sheetInstruct  = "Инструкция"
)

var SheetOrder = []string{sheetWeekly, sheetStages, sheetHospitals, sheetSurvey, sheetInstruct}

var WeeklyHeaders = []string{
	"ID кейса", "Дата осмотра", "ПМСП", "ФИО врача", "Пациент",
	"Возраст (лет)", "Тромбоциты (×10⁹/л)", "АЛТ (Ед/л)", "АСТ (Ед/л)",
	"Этиология", "Этап скрининга", "Аппарат УЗИ",
	"Стадия фиброза", "Степень стеатоза", "Эхоструктура", "Диагноз AI",
	"Совпадение с AI", "ХВГ статус", "Уверенность врача", "Маршрут", "Примечания",
}

func BuildReport(cases []domain.Case, surveys []domain.Survey) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	defaultSheet := f.GetSheetName(0)
	_ = f.SetSheetName(defaultSheet, sheetWeekly)

	for _, name := range []string{sheetStages, sheetHospitals, sheetSurvey, sheetInstruct} {
		if _, err := f.NewSheet(name); err != nil {
			return nil, err
		}
	}

	if err := writeWeeklySheet(f, cases); err != nil {
		return nil, err
	}
	if err := writeStagesSheet(f, domain.ComputeStageRows(cases)); err != nil {
		return nil, err
	}
	if err := writeHospitalsSheet(f, domain.ComputeHospitalRows(cases)); err != nil {
		return nil, err
	}
	if err := writeSurveySheet(f, surveys); err != nil {
		return nil, err
	}
	if err := writeInstructionSheet(f); err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func BuildSurveyReport(surveys []domain.Survey) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	defaultSheet := f.GetSheetName(0)
	_ = f.SetSheetName(defaultSheet, sheetSurvey)
	if err := writeSurveySheet(f, surveys); err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func writeWeeklySheet(f *excelize.File, cases []domain.Case) error {
	for i, h := range WeeklyHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheetWeekly, cell, h)
	}
	for rowIdx, c := range cases {
		aiMatch := ""
		if c.AIMatch != nil {
			aiMatch = *c.AIMatch
		}
		vals := []any{
			c.CaseID, c.Date, c.Hospital, c.Doctor, domain.PatientLabel(c.MotherSurname, c.ChildSurname),
			c.GA, c.BW, c.PCA, c.PH, c.Eye, c.Visit, c.Camera,
			c.Stage, c.PlusDisease, c.RopForm, c.PreDiag, aiMatch, c.Aprop, c.Confidence, c.Recommendation, c.Notes,
		}
		for colIdx, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowIdx+2)
			_ = f.SetCellValue(sheetWeekly, cell, v)
			if domain.IsReferredToHepatologist(c.Recommendation) || c.Stage == "F4" {
				style, _ := f.NewStyle(&excelize.Style{Fill: excelize.Fill{Type: "pattern", Color: []string{"#FECACA"}, Pattern: 1}})
				_ = f.SetCellStyle(sheetWeekly, cell, cell, style)
			}
		}
	}

	_ = addListValidation(f, sheetWeekly, "M2:M1000", domain.StageOrder)
	_ = addListValidation(f, sheetWeekly, "N2:N1000", []string{"Нет / минимальный", "Лёгкий", "Умеренный", "Выраженный"})
	_ = addListValidation(f, sheetWeekly, "O2:O1000", []string{"Норма", "Гиперэхогенность", "Неоднородная эхоструктура", "Узел / очаг", "Асцит"})
	_ = addListValidation(f, sheetWeekly, "R2:R1000", []string{"Нет", "Да (ХВГ)", "Неизвестно"})
	return nil
}

func addListValidation(f *excelize.File, sheet, sqref string, options []string) error {
	dv := excelize.NewDataValidation(true)
	dv.Sqref = sqref
	if err := dv.SetDropList(options); err != nil {
		return err
	}
	dv.SetError(excelize.DataValidationErrorStyleStop, "Недопустимое значение", "Выберите значение из списка")
	return f.AddDataValidation(sheet, dv)
}

func writeSurveySheet(f *excelize.File, surveys []domain.Survey) error {
	headers := []string{
		"Дата", "Больница",
		"UX1", "UX2", "UX3", "UX4", "UX5",
		"Клин1", "Клин2", "Клин3", "Клин4",
		"Проц1", "Проц2", "Проц3",
		"Среднее удобство", "Среднее клин. ценность", "Среднее процесс", "Итого", "Комментарий",
	}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheetSurvey, cell, h)
	}
	for rowIdx, s := range surveys {
		scores, _ := postgres.ParseScores(s.Scores)
		row := []any{s.Date, s.Hospital}
		for i := 0; i < 12; i++ {
			if i < len(scores) {
				row = append(row, scores[i])
			} else {
				row = append(row, "")
			}
		}
		row = append(row, s.UXAvg, s.ClinicalAvg, s.ProcessAvg, s.TotalAvg, s.Comment)
		for colIdx, v := range row {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowIdx+2)
			_ = f.SetCellValue(sheetSurvey, cell, v)
		}
	}

	if len(surveys) > 0 {
		summaryRow := len(surveys) + 2
		firstData := 2
		lastData := len(surveys) + 1
		_ = f.SetCellValue(sheetSurvey, fmt.Sprintf("A%d", summaryRow), "СРЕДНЕЕ")
		for _, col := range []string{"O", "P", "Q", "R"} {
			_ = f.SetCellFormula(sheetSurvey, fmt.Sprintf("%s%d", col, summaryRow), fmt.Sprintf("AVERAGE(%s%d:%s%d)", col, firstData, col, lastData))
		}
	}
	return nil
}

func writeStagesSheet(f *excelize.File, rows []domain.StageRow) error {
	headers := []string{"Стадия", "Кол-во", "Высокий риск", "Направлено к гепатологу", "Средний возраст"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheetStages, cell, h)
	}

	dataRows := rows
	hasTotal := len(rows) > 0 && rows[len(rows)-1].Stage == "ИТОГО"
	if hasTotal {
		dataRows = rows[:len(rows)-1]
	}

	for rowIdx, r := range dataRows {
		rowNum := rowIdx + 2
		vals := []any{r.Stage, r.Count, r.PlusDisease, r.Aggressive, formatFloat(r.AvgGA)}
		for colIdx, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowNum)
			_ = f.SetCellValue(sheetStages, cell, v)
		}
	}

	if hasTotal {
		totalRow := len(dataRows) + 2
		firstData := 2
		lastData := len(dataRows) + 1
		_ = f.SetCellValue(sheetStages, fmt.Sprintf("A%d", totalRow), "ИТОГО")
		for _, col := range []string{"B", "C", "D"} {
			_ = f.SetCellFormula(sheetStages, fmt.Sprintf("%s%d", col, totalRow), fmt.Sprintf("SUM(%s%d:%s%d)", col, firstData, col, lastData))
		}
		total := rows[len(rows)-1]
		_ = f.SetCellValue(sheetStages, fmt.Sprintf("E%d", totalRow), formatFloat(total.AvgGA))
	}
	return nil
}

func writeHospitalsSheet(f *excelize.File, rows []domain.HospitalRow) error {
	headers := []string{"Больница", "Всего", "Норма", "F0–F1", "F2–F3", "F4/Цирроз", "К гепатологу", "Сомнительные"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheetHospitals, cell, h)
	}
	for rowIdx, r := range rows {
		vals := []any{r.Hospital, r.Total, r.ROPDetected, r.Stages12, r.Stages35, r.PlusDisease, r.Aggressive, r.Doubtful}
		for colIdx, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowIdx+2)
			_ = f.SetCellValue(sheetHospitals, cell, v)
		}
	}
	return nil
}

func writeInstructionSheet(f *excelize.File) error {
	lines := []string{
		"ИНСТРУКЦИЯ ПО ЗАПОЛНЕНИЮ",
		"",
		"Лист 1: Еженедельный отчёт — одна строка на каждого пациента. Данные заполняются через веб-форму «Карта пациента».",
		"Лист 2: Стадии фиброза — автоматическая сводка по стадиям F0–F4 из карт пациентов.",
		"Лист 3: Сводка по больницам — автоматическая сводка по 6 пилотным ПМСП.",
		"Лист 4: Продуктовые метрики — анкета врача (12 вопросов, шкала 1–5), вкладка «Продуктовые метрики» в приложении.",
		"Лист 5: Инструкция — этот лист.",
		"",
		"Контакты координатора пилота: coordinator@liver.kz",
		fmt.Sprintf("Сгенерировано: %s", time.Now().Format("2006-01-02 15:04")),
	}
	for i, line := range lines {
		cell, _ := excelize.CoordinatesToCellName(1, i+1)
		_ = f.SetCellValue(sheetInstruct, cell, line)
	}
	_ = f.SetColWidth(sheetInstruct, "A", "A", 100)
	return nil
}

func formatFloat(v *float64) string {
	if v == nil {
		return ""
	}
	return strconv.FormatFloat(*v, 'f', 1, 64)
}

func Filename() string {
	return fmt.Sprintf("LiverScreening_Weekly_%s.xlsx", time.Now().Format("2006-01-02"))
}

func SurveyFilename() string {
	return fmt.Sprintf("LiverScreening_Survey_%s.xlsx", time.Now().Format("2006-01-02"))
}
