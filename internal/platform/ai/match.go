package ai

import (
	"strings"

	"github.com/eyeeyeai/pilot/internal/domain"
)

const (
	MatchFull    = "Совпадает"
	MatchPartial = "Частично"
	MatchDiff    = "Расхождение"
)

type fieldPair struct {
	doctor string
	ai     string
}

func ComputeMatch(c *domain.Case, ai InferenceResponse) string {
	pairs := []fieldPair{
		{c.Stage, ai.Stage},
		{c.PlusDisease, ai.PlusDisease},
		{c.Zone, ai.Zone},
		{c.RopForm, ai.RopForm},
		{c.PreDiag, ai.PreDiag},
		{c.Aprop, ai.Aprop},
	}

	compared := 0
	matched := 0
	for _, p := range pairs {
		d := normalizeClinical(p.doctor)
		a := normalizeClinical(p.ai)
		if d == "" || a == "" {
			continue
		}
		compared++
		if d == a {
			matched++
		}
	}
	if compared == 0 {
		return ""
	}
	if matched == compared {
		return MatchFull
	}
	if matched == 0 {
		return MatchDiff
	}
	return MatchPartial
}

func normalizeClinical(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	s = strings.ReplaceAll(s, "ё", "е")
	return s
}
