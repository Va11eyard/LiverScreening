package storage

import (
	"bytes"
	"mime/multipart"
	"os"
	"path/filepath"
	"testing"
)

func TestSaveRejectsOversizedFile(t *testing.T) {
	dir := t.TempDir()
	s, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}

	fh := &multipart.FileHeader{
		Filename: "big.jpg",
		Size:     MaxFileSize + 1,
	}
	if _, err := s.Save("EEA-2026-001", fh); err != ErrFileTooLarge {
		t.Fatalf("expected ErrFileTooLarge, got %v", err)
	}
}

func TestSaveAcceptsJPEG(t *testing.T) {
	dir := t.TempDir()
	s, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}

	body := append([]byte{0xFF, 0xD8, 0xFF}, bytes.Repeat([]byte{0x00}, 100)...)
	fh := newFileHeader(t, "scan.jpg", body)
	saved, err := s.Save("EEA-2026-001", fh)
	if err != nil {
		t.Fatal(err)
	}
	if saved.MimeType != "image/jpeg" {
		t.Fatalf("mime=%s", saved.MimeType)
	}
	if _, err := os.Stat(filepath.Join(dir, "EEA-2026-001", saved.StoredName)); err != nil {
		t.Fatal(err)
	}
}

func TestBuildArchive(t *testing.T) {
	dir := t.TempDir()
	s, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}

	body := append([]byte{0xFF, 0xD8, 0xFF}, bytes.Repeat([]byte{0xAB}, 50)...)
	fh := newFileHeader(t, "a.jpg", body)
	saved, err := s.Save("EEA-2026-002", fh)
	if err != nil {
		t.Fatal(err)
	}

	data, err := s.BuildArchive("EEA-2026-002", []ZipEntry{{Name: "a.jpg", StoredName: saved.StoredName}})
	if err != nil {
		t.Fatal(err)
	}
	if len(data) < 50 {
		t.Fatalf("archive too small: %d", len(data))
	}
}

func TestRemoveDeletesFile(t *testing.T) {
	dir := t.TempDir()
	s, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}

	body := append([]byte{0xFF, 0xD8, 0xFF}, bytes.Repeat([]byte{0xAB}, 50)...)
	fh := newFileHeader(t, "a.jpg", body)
	saved, err := s.Save("EEA-2026-003", fh)
	if err != nil {
		t.Fatal(err)
	}
	path := s.FilePath("EEA-2026-003", saved.StoredName)
	if err := s.Remove("EEA-2026-003", saved.StoredName); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("file should be removed, stat err=%v", err)
	}
}

func newFileHeader(t *testing.T, filename string, data []byte) *multipart.FileHeader {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, err := w.CreateFormFile("images", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	r := multipart.NewReader(&buf, w.Boundary())
	form, err := r.ReadForm(10 << 20)
	if err != nil {
		t.Fatal(err)
	}
	return form.File["images"][0]
}
