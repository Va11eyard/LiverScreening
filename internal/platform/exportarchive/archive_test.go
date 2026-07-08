package exportarchive

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteListRead(t *testing.T) {
	dir := t.TempDir()
	name := "LiverScreening_Weekly_2026-06-27.xlsx"
	data := []byte("fake-xlsx")

	if err := Write(dir, name, data); err != nil {
		t.Fatal(err)
	}

	list, err := List(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Name != name {
		t.Fatalf("list: %+v", list)
	}

	got, err := Read(dir, name)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(data) {
		t.Fatalf("read: %q", got)
	}
}

func TestValidateFilenameRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	err := Write(dir, "../evil.xlsx", []byte("x"))
	if !errors.Is(err, ErrInvalidFilename) {
		t.Fatalf("expected ErrInvalidFilename, got %v", err)
	}
}

func TestReadNotFound(t *testing.T) {
	dir := t.TempDir()
	_, err := Read(dir, "LiverScreening_Weekly_2026-01-01.xlsx")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestWriteAtomic(t *testing.T) {
	dir := t.TempDir()
	name := "LiverScreening_Weekly_2026-06-28.xlsx"
	if err := Write(dir, name, []byte("v1")); err != nil {
		t.Fatal(err)
	}
	if err := Write(dir, name, []byte("v2")); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "v2" {
		t.Fatalf("got %q", got)
	}
}
