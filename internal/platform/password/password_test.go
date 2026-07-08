package password

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestHashAndVerify(t *testing.T) {
	hash, err := Hash("secret-password")
	if err != nil {
		t.Fatal(err)
	}
	if err := Verify(hash, "secret-password"); err != nil {
		t.Fatal(err)
	}
	if err := Verify(hash, "wrong"); err == nil {
		t.Fatal("expected mismatch")
	}
}

func TestVerifyLegacyBcrypt(t *testing.T) {
	legacyBytes, err := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	legacy := string(legacyBytes)
	if err := Verify(legacy, "password"); err != nil {
		t.Fatal(err)
	}
	if !NeedsRehash(legacy) {
		t.Fatal("bcrypt should need rehash")
	}
}
