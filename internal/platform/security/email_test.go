package security

import "testing"

func TestRedactEmail(t *testing.T) {
	got := RedactEmail("doctor@eyeeye.kz")
	if got != "d***@eyeeye.kz" {
		t.Fatalf("got %q", got)
	}
}
