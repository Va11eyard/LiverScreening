package ai

import (
	"os"
	"testing"
)

func TestValidateInferenceURLRejectsHTTP(t *testing.T) {
	t.Setenv("AI_INFERENCE_ALLOW_HTTP", "")
	if err := ValidateInferenceURL("http://ml.example.com/analyze"); err != ErrInferenceURLScheme {
		t.Fatalf("got %v", err)
	}
}

func TestValidateInferenceURLAllowsHTTPWhenEnabled(t *testing.T) {
	t.Setenv("AI_INFERENCE_ALLOW_HTTP", "true")
	if err := ValidateInferenceURL("http://ml-api:8000/inference"); err != nil {
		t.Fatalf("got %v", err)
	}
}

func TestValidateInferenceURLRejectsLoopback(t *testing.T) {
	t.Setenv("AI_INFERENCE_ALLOW_HTTP", "")
	if err := ValidateInferenceURL("https://127.0.0.1/analyze"); err != ErrInferenceURLPrivate {
		t.Fatalf("got %v", err)
	}
}

func TestValidateInferenceURLAcceptsHTTPS(t *testing.T) {
	if err := ValidateInferenceURL("https://ml.example.com/analyze"); err != nil {
		t.Fatal(err)
	}
}

func TestMain(m *testing.M) {
	_ = os.Unsetenv("AI_INFERENCE_ALLOW_HTTP")
	os.Exit(m.Run())
}
