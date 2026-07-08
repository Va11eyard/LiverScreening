#!/bin/bash
set -euo pipefail

SITE=/etc/nginx/sites-enabled/platform.cornea.kz

sudo python3 <<'PY'
from pathlib import Path
p = Path("/etc/nginx/sites-enabled/platform.cornea.kz")
text = p.read_text()

if text.count("client_max_body_size") > 1:
    lines = []
    seen_body = False
    for line in text.splitlines():
        if "client_max_body_size" in line:
            if seen_body:
                continue
            seen_body = True
        lines.append(line)
    text = "\n".join(lines) + ("\n" if text.endswith("\n") else "")

if "proxy_buffer_size" in text:
    print("already has proxy_buffer_size")
else:
    block = """    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
    large_client_header_buffers 4 32k;

"""
    needle = "    location / {"
    if needle not in text:
        raise SystemExit("location / block not found")
    text = text.replace(needle, block + needle, 1)
    print("added proxy buffers")

if "client_max_body_size" not in text:
    text = text.replace(
        "    location / {",
        "    client_max_body_size 420M;\n\n    location / {",
        1,
    )
    print("added client_max_body_size")

p.write_text(text)
PY

sudo nginx -t
sudo systemctl reload nginx
echo "nginx reloaded OK"
