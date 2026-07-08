package domain

import "testing"

func TestParseAge(t *testing.T) {
	v, ok := ParseAge("52")
	if !ok || v != 52 {
		t.Fatalf("got %v ok=%v", v, ok)
	}
	v, ok = ParseAge("45,5")
	if !ok || v != 45.5 {
		t.Fatalf("got %v ok=%v", v, ok)
	}
}

func TestComputeStageRows(t *testing.T) {
	cases := []Case{
		{Stage: "F3", PlusDisease: "Выраженный", Recommendation: "Направление к гепатологу", GA: "58"},
		{Stage: "F0", PlusDisease: "Нет / минимальный", GA: "42"},
	}
	rows := ComputeStageRows(cases)
	if len(rows) != len(StageOrder)+1 {
		t.Fatalf("expected %d rows, got %d", len(StageOrder)+1, len(rows))
	}
	found := false
	for _, r := range rows {
		if r.Stage == "F3" && r.Count == 1 && r.PlusDisease == 1 && r.Aggressive == 1 {
			found = true
		}
	}
	if !found {
		t.Fatal("F3 row not aggregated correctly")
	}
}

func TestHospitalMatches(t *testing.T) {
	h := PilotHospitals[0]
	if !HospitalMatches(h, h) {
		t.Fatal("exact match failed")
	}
	if !HospitalMatches(h, h[:12]) {
		t.Fatal("prefix match failed")
	}
}

func TestIsNormalFinding(t *testing.T) {
	if !IsNormalFinding(Case{Stage: "F0"}) {
		t.Fatal("F0 should be normal")
	}
	if !IsNormalFinding(Case{PreDiag: "Норма"}) {
		t.Fatal("Норма pre_diag should be normal")
	}
	if IsNormalFinding(Case{Stage: "F2"}) {
		t.Fatal("F2 should not be normal")
	}
}
