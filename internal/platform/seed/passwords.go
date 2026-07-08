package seed

import (
	"bufio"
	"os"
	"strings"
)

// LoadDoctorPasswords reads email=password lines from path. Missing file returns nil map.
func LoadDoctorPasswords(path string) (map[string]string, error) {
	if path == "" {
		return nil, nil
	}
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()

	out := make(map[string]string)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		email, pass, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		email = strings.TrimSpace(email)
		pass = strings.TrimSpace(pass)
		if email != "" && pass != "" {
			out[strings.ToLower(email)] = pass
		}
	}
	return out, scanner.Err()
}
