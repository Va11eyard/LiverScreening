package password

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

const (
	argonTime    = 3
	argonMemory  = 64 * 1024
	argonThreads = 4
	argonKeyLen  = 32
	argonSaltLen = 16
)

var ErrMismatch = errors.New("password mismatch")

func Hash(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("argon2id$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

func Verify(encoded, password string) error {
	if strings.HasPrefix(encoded, "argon2id$") {
		parts := strings.Split(encoded, "$")
		if len(parts) != 3 {
			return ErrMismatch
		}
		salt, err := base64.RawStdEncoding.DecodeString(parts[1])
		if err != nil {
			return ErrMismatch
		}
		want, err := base64.RawStdEncoding.DecodeString(parts[2])
		if err != nil {
			return ErrMismatch
		}
		got := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, uint32(len(want)))
		if subtle.ConstantTimeCompare(got, want) != 1 {
			return ErrMismatch
		}
		return nil
	}
	if err := bcrypt.CompareHashAndPassword([]byte(encoded), []byte(password)); err != nil {
		return ErrMismatch
	}
	return nil
}

func NeedsRehash(encoded string) bool {
	return !strings.HasPrefix(encoded, "argon2id$")
}
