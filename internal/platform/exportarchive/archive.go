package exportarchive

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

var (
	ErrInvalidFilename = errors.New("invalid filename")
	ErrNotFound        = errors.New("not found")
)

type Entry struct {
	Name    string    `json:"name"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"mod_time"`
}

func EnsureDir(dir string) error {
	return os.MkdirAll(dir, 0o755)
}

func ValidateFilename(name string) error {
	name = strings.TrimSpace(name)
	if name == "" || name != filepath.Base(name) {
		return ErrInvalidFilename
	}
	if strings.Contains(name, "..") {
		return ErrInvalidFilename
	}
	if !strings.HasPrefix(name, "LiverScreening_Weekly_") || !strings.HasSuffix(strings.ToLower(name), ".xlsx") {
		return ErrInvalidFilename
	}
	return nil
}

func Write(dir, filename string, data []byte) error {
	if err := ValidateFilename(filename); err != nil {
		return err
	}
	if err := EnsureDir(dir); err != nil {
		return err
	}

	dest := filepath.Join(dir, filename)
	tmp, err := os.CreateTemp(dir, ".export-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer func() {
		tmp.Close()
		os.Remove(tmpName)
	}()

	if _, err := tmp.Write(data); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, dest)
}

func List(dir string) ([]Entry, error) {
	if err := EnsureDir(dir); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if err := ValidateFilename(name); err != nil {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, Entry{
			Name:    name,
			Size:    info.Size(),
			ModTime: info.ModTime(),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].ModTime.After(out[j].ModTime)
	})
	return out, nil
}

func Read(dir, filename string) ([]byte, error) {
	if err := ValidateFilename(filename); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, filename)
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}
