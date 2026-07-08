package storage

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

const (
	MaxFileSize     = 20 * 1024 * 1024
	MaxFilesPerCase = 30
	MaxUploadRequestBytes = 10*MaxFileSize + (4 << 20)
)

var (
	ErrFileTooLarge    = errors.New("file too large")
	ErrTooManyFiles    = errors.New("too many files")
	ErrInvalidFileType = errors.New("invalid file type")
)

var allowedMIMEs = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/tiff": ".tiff",
}

type SavedFile struct {
	StoredName string
	MimeType   string
	SizeBytes  int64
}

type Store struct {
	root string
}

func New(root string) (*Store, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, fmt.Errorf("create upload dir: %w", err)
	}
	return &Store{root: root}, nil
}

func (s *Store) CaseDir(caseID string) string {
	return filepath.Join(s.root, sanitizeCaseID(caseID))
}

func (s *Store) FilePath(caseID, storedName string) string {
	return filepath.Join(s.CaseDir(caseID), storedName)
}

func (s *Store) Save(caseID string, fh *multipart.FileHeader) (*SavedFile, error) {
	if fh.Size > MaxFileSize {
		return nil, ErrFileTooLarge
	}

	src, err := fh.Open()
	if err != nil {
		return nil, err
	}
	defer src.Close()

	head := make([]byte, 512)
	n, err := io.ReadFull(src, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return nil, err
	}
	head = head[:n]

	mime := detectMIME(head, fh.Filename)
	ext, ok := allowedMIMEs[mime]
	if !ok {
		return nil, ErrInvalidFileType
	}

	storedName := uuid.New().String() + ext
	if err := os.MkdirAll(s.CaseDir(caseID), 0o755); err != nil {
		return nil, err
	}

	dstPath := s.FilePath(caseID, storedName)
	dst, err := os.Create(dstPath)
	if err != nil {
		return nil, err
	}
	defer dst.Close()

	if _, err := dst.Write(head); err != nil {
		os.Remove(dstPath)
		return nil, err
	}
	written, err := io.Copy(dst, src)
	if err != nil {
		os.Remove(dstPath)
		return nil, err
	}

	return &SavedFile{
		StoredName: storedName,
		MimeType:   mime,
		SizeBytes:  int64(n) + written,
	}, nil
}

type ZipEntry struct {
	Name       string
	StoredName string
}

func (s *Store) ReadFile(caseID, storedName string) ([]byte, error) {
	return os.ReadFile(s.FilePath(caseID, storedName))
}

func (s *Store) Remove(caseID, storedName string) error {
	path := s.FilePath(caseID, storedName)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *Store) BuildArchive(caseID string, entries []ZipEntry) ([]byte, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, e := range entries {
		path := s.FilePath(caseID, e.StoredName)
		data, err := os.ReadFile(path)
		if err != nil {
			zw.Close()
			return nil, err
		}
		w, err := zw.Create(e.Name)
		if err != nil {
			zw.Close()
			return nil, err
		}
		if _, err := w.Write(data); err != nil {
			zw.Close()
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func detectMIME(head []byte, filename string) string {
	if len(head) > 0 {
		if mime := strings.TrimSpace(httpDetect(head)); mime != "application/octet-stream" {
			if _, ok := allowedMIMEs[mime]; ok {
				return mime
			}
		}
	}
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".tif", ".tiff":
		return "image/tiff"
	default:
		return "application/octet-stream"
	}
}

func httpDetect(head []byte) string {
	if len(head) >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF {
		return "image/jpeg"
	}
	if len(head) >= 8 && head[0] == 0x89 && head[1] == 0x50 && head[2] == 0x4E && head[3] == 0x47 {
		return "image/png"
	}
	if len(head) >= 4 {
		if string(head[:4]) == "II*\x00" || string(head[:4]) == "MM\x00*" {
			return "image/tiff"
		}
	}
	return "application/octet-stream"
}

func sanitizeCaseID(caseID string) string {
	caseID = strings.TrimSpace(caseID)
	caseID = strings.ReplaceAll(caseID, "..", "")
	caseID = strings.ReplaceAll(caseID, string(os.PathSeparator), "")
	return caseID
}
