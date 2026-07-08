package security

import "strings"

func RedactEmail(email string) string {
	parts := strings.SplitN(strings.TrimSpace(email), "@", 2)
	if len(parts) != 2 || parts[0] == "" {
		return "***"
	}
	local := parts[0]
	if len(local) > 1 {
		local = local[:1] + "***"
	}
	return local + "@" + parts[1]
}
