package domain

import "strings"

func PatientLabel(mother, child string) string {
	mother = strings.TrimSpace(mother)
	child = strings.TrimSpace(child)
	if mother != "" && child != "" {
		return mother + " (" + child + ")"
	}
	if mother != "" {
		return mother
	}
	return child
}
