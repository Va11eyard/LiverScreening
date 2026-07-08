package seed

import (
	"strings"

	"github.com/eyeeyeai/pilot/internal/domain"
	"github.com/eyeeyeai/pilot/internal/platform/config"
)

type UserSpec struct {
	Email    string
	Password string
	Name     string
	Role     domain.Role
	Hospital string
}

var pilotDoctors = []struct {
	email string
	name  string
}{
	{"doctor@liver.kz", "Иванова А.Б."},
	{"doctor2@liver.kz", "Петров С.В."},
	{"doctor3@liver.kz", "Смагулова К.М."},
	{"doctor4@liver.kz", "Нургалиев Е.Т."},
	{"doctor5@liver.kz", "Жумабекова А.К."},
	{"doctor6@liver.kz", "Калиев Д.Н."},
	{"doctor7@liver.kz", "Омаров Р.И."},
}

func UserSpecs(cfg config.Config, doctorPasswords map[string]string) []UserSpec {
	out := []UserSpec{
		{
			Email:    cfg.SeedAdminEmail,
			Password: cfg.SeedAdminPassword,
			Name:     "Координатор пилота",
			Role:     domain.RoleCoordinator,
		},
	}
	for i, d := range pilotDoctors {
		hospital := ""
		if i < len(domain.PilotHospitals) {
			hospital = domain.PilotHospitals[i]
		}
		pass := cfg.SeedDoctorPassword
		if doctorPasswords != nil {
			if p, ok := doctorPasswords[strings.ToLower(d.email)]; ok && p != "" {
				pass = p
			}
		}
		out = append(out, UserSpec{
			Email:    d.email,
			Password: pass,
			Name:     d.name,
			Role:     domain.RoleDoctor,
			Hospital: hospital,
		})
	}
	return out
}
