package domain

import "testing"

func TestPatientLabel(t *testing.T) {
	if got := PatientLabel("Иванова", "Петрова"); got != "Иванова (Петрова)" {
		t.Fatalf("got %q", got)
	}
	if got := PatientLabel("Иванова", ""); got != "Иванова" {
		t.Fatalf("got %q", got)
	}
}
