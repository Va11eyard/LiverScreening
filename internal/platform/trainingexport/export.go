package trainingexport

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"fmt"
	"path"
	"strings"
	"time"

	"github.com/eyeeyeai/pilot/internal/domain"
)

type Row struct {
	Case         domain.Case
	ImageID      string
	OriginalName string
	UploadedAt   time.Time
	FileName     string
}

func BuildZIPFromRows(rows []Row, fileData map[string][]byte) ([]byte, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	manifestBuf := &bytes.Buffer{}
	mc := csv.NewWriter(manifestBuf)
	if err := mc.Write([]string{
		"case_id", "date", "hospital", "doctor", "mother_surname", "child_surname", "patient_label",
		"eye", "visit", "stage", "plus_disease", "zone", "rop_form", "pre_diag", "aprop", "doubtful",
		"ga", "bw", "pca", "ph", "image_id", "image_file", "uploaded_at",
	}); err != nil {
		return nil, err
	}

	for _, r := range rows {
		c := r.Case
		if err := mc.Write([]string{
			c.CaseID, c.Date, c.Hospital, c.Doctor, c.MotherSurname, c.ChildSurname,
			domain.PatientLabel(c.MotherSurname, c.ChildSurname),
			c.Eye, c.Visit, c.Stage, c.PlusDisease, c.Zone, c.RopForm, c.PreDiag, c.Aprop, c.Doubtful,
			c.GA, fmt.Sprintf("%d", c.BW), fmt.Sprintf("%d", c.PCA), c.PH,
			r.ImageID, r.FileName, r.UploadedAt.Format(time.RFC3339),
		}); err != nil {
			return nil, err
		}
	}
	mc.Flush()
	if err := mc.Error(); err != nil {
		return nil, err
	}

	mw, err := zw.Create("manifest.csv")
	if err != nil {
		return nil, err
	}
	if _, err := mw.Write(manifestBuf.Bytes()); err != nil {
		return nil, err
	}

	written := make(map[string]struct{})
	for _, r := range rows {
		if r.FileName == "" {
			continue
		}
		if _, ok := written[r.FileName]; ok {
			continue
		}
		data := fileData[r.FileName]
		if len(data) == 0 {
			continue
		}
		written[r.FileName] = struct{}{}
		fw, err := zw.Create(path.Join("images", r.FileName))
		if err != nil {
			return nil, err
		}
		if _, err := fw.Write(data); err != nil {
			return nil, err
		}
	}

	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func ImageFileName(caseID, imageID, ext string) string {
	ext = strings.TrimPrefix(ext, ".")
	if ext == "" {
		ext = "jpg"
	}
	return fmt.Sprintf("%s_%s.%s", sanitize(caseID), sanitize(imageID), ext)
}

func sanitize(s string) string {
	return strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, s)
}
