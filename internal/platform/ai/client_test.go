package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eyeeyeai/pilot/internal/domain"
)

func TestAnalyzeMapsResponse(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method=%s", r.Method)
		}
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			t.Fatal(err)
		}
		if r.FormValue("metadata") == "" {
			t.Fatal("missing metadata")
		}
		file, _, err := r.FormFile("image")
		if err != nil {
			t.Fatal(err)
		}
		defer file.Close()
		_ = json.NewEncoder(w).Encode(InferenceResponse{
			Stage:       "Ст. 3",
			PlusDisease: "Нет",
			PreDiag:     "ROP",
		})
	}))
	defer srv.Close()

	c := &Client{
		baseURL:    srv.URL,
		apiKey:     "test-key",
		httpClient: srv.Client(),
	}
	got, err := c.Analyze(context.Background(), InferenceRequest{CaseID: "EEA-2026-001"}, []byte{0xFF, 0xD8, 0xFF}, "scan.jpg", "image/jpeg")
	if err != nil {
		t.Fatal(err)
	}
	if got.Stage != "Ст. 3" || got.PlusDisease != "Нет" {
		t.Fatalf("unexpected %+v", got)
	}
}

func TestComputeMatch(t *testing.T) {
	c := &domain.Case{
		Stage:       "Ст. 3",
		PlusDisease: "Нет",
		Zone:        "II",
	}
	full := InferenceResponse{Stage: "Ст. 3", PlusDisease: "Нет", Zone: "II"}
	if ComputeMatch(c, full) != MatchFull {
		t.Fatal("expected full match")
	}
	diff := InferenceResponse{Stage: "Ст. 1", PlusDisease: "Есть", Zone: "I"}
	if ComputeMatch(c, diff) != MatchDiff {
		t.Fatal("expected diff")
	}
	partial := InferenceResponse{Stage: "Ст. 3", PlusDisease: "Есть", Zone: "II"}
	if ComputeMatch(c, partial) != MatchPartial {
		t.Fatal("expected partial")
	}
}
