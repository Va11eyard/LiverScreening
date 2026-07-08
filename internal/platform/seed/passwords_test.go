package seed

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDoctorPasswords(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "passwords.env")
	if err := os.WriteFile(path, []byte("doctor@eyeeye.kz=secret1\n# comment\ndoctor2@eyeeye.kz=secret2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	m, err := LoadDoctorPasswords(path)
	if err != nil {
		t.Fatal(err)
	}
	if m["doctor@eyeeye.kz"] != "secret1" || m["doctor2@eyeeye.kz"] != "secret2" {
		t.Fatalf("got %#v", m)
	}
}
