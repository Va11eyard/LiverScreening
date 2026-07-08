package domain

import "testing"

func TestParseGAWeeks(t *testing.T) {
	v, ok := ParseGAWeeks("28+3")
	if !ok {
		t.Fatal("expected ok")
	}
	if v < 28.4 || v > 28.5 {
		t.Fatalf("got %v", v)
	}
}

func TestComputeStageRows(t *testing.T) {
	cases := []Case{
		{Stage: "Ст. 3", PlusDisease: "Есть 🚨", Aprop: "Да (AP-ROP)", GA: "28+0", BW: 1100, PH: "7.32 (Капиллярный)"},
		{Stage: "Нет РН", PlusDisease: "Нет", GA: "30+0", BW: 1500},
	}
	rows := ComputeStageRows(cases)
	if len(rows) != len(StageOrder)+1 {
		t.Fatalf("expected %d rows, got %d", len(StageOrder)+1, len(rows))
	}
	found := false
	for _, r := range rows {
		if r.Stage == "Ст. 3" && r.Count == 1 && r.PlusDisease == 1 {
			found = true
		}
	}
	if !found {
		t.Fatal("stage 3 row not aggregated correctly")
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
