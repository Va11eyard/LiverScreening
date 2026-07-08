from __future__ import annotations

import io
import re
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    "node_modules",
    ".git",
    "docs",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".next",
    "dist",
    "build",
}
EXTENSIONS = {".py", ".go", ".ts", ".tsx", ".js"}


def should_skip(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def strip_python(path: Path) -> str:
    source = path.read_text(encoding="utf-8")
    out: list[str] = []
    prev_end_row = 0
    prev_end_col = 0
    for tok in tokenize.generate_tokens(io.StringIO(source).readline):
        ttype, tstr, start, end, _ = tok
        srow, scol = start
        erow, ecol = end
        if ttype == tokenize.COMMENT:
            continue
        if ttype == tokenize.STRING and tstr in {'"""', "'''"}:
            continue
        if ttype == tokenize.STRING and (
            (tstr.startswith('"""') and tstr.endswith('"""'))
            or (tstr.startswith("'''") and tstr.endswith("'''"))
        ):
            if scol == 0 or (scol <= 4 and out and out[-1].strip() == ""):
                continue
            prev_stmt = "".join(out).rstrip()
            if prev_stmt.endswith(":") or prev_stmt.endswith("):") or prev_stmt == "":
                continue
        if srow > prev_end_row:
            out.append("\n" * (srow - prev_end_row - 1))
            prev_end_col = 0
        if srow == prev_end_row and scol > prev_end_col:
            out.append(" " * (scol - prev_end_col))
        out.append(tstr)
        prev_end_row, prev_end_col = erow, ecol
    text = "".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    if text and not text.endswith("\n"):
        text += "\n"
    return text


def strip_line_comment(line: str, marker: str) -> str:
    in_single = False
    in_double = False
    escape = False
    i = 0
    while i < len(line):
        ch = line[i]
        if escape:
            escape = False
            i += 1
            continue
        if ch == "\\":
            escape = True
            i += 1
            continue
        if ch == "'" and not in_double:
            in_single = not in_single
            i += 1
            continue
        if ch == '"' and not in_single:
            in_double = not in_double
            i += 1
            continue
        if not in_single and not in_double and line.startswith(marker, i):
            return line[:i].rstrip()
        i += 1
    return line


def strip_c_like(path: Path) -> str:
    source = path.read_text(encoding="utf-8")
    ext = path.suffix
    out: list[str] = []
    i = 0
    n = len(source)
    in_line = False
    in_block = False
    in_single = False
    in_double = False
    in_backtick = False
    escape = False
    buf: list[str] = []

    def flush_line():
        nonlocal buf
        if buf:
            out.append("".join(buf))
            buf = []

    while i < n:
        ch = source[i]
        nxt = source[i + 1] if i + 1 < n else ""

        if in_block:
            if ch == "*" and nxt == "/":
                in_block = False
                i += 2
                continue
            i += 1
            continue

        if in_line:
            if ch == "\n":
                in_line = False
                buf.append(ch)
                flush_line()
            i += 1
            continue

        if escape:
            buf.append(ch)
            escape = False
            i += 1
            continue

        if in_backtick:
            buf.append(ch)
            if ch == "`":
                in_backtick = False
            i += 1
            continue

        if in_single:
            buf.append(ch)
            if ch == "'":
                in_single = False
            elif ch == "\\":
                escape = True
            i += 1
            continue

        if in_double:
            buf.append(ch)
            if ch == '"':
                in_double = False
            elif ch == "\\":
                escape = True
            i += 1
            continue

        if ext in {".ts", ".tsx", ".js"} and ch == "`":
            in_backtick = True
            buf.append(ch)
            i += 1
            continue

        if ch == "/" and nxt == "/":
            if ext == ".go" and source[i:].startswith("//go:"):
                buf.append(ch)
                i += 1
                continue
            in_line = True
            i += 2
            continue

        if ch == "/" and nxt == "*":
            if ext in {".ts", ".tsx", ".js"} and i > 0 and source[i - 1] == "{":
                buf.append(ch)
                i += 1
                continue
            in_block = True
            i += 2
            continue

        if ch == "'":
            in_single = True
            buf.append(ch)
            i += 1
            continue

        if ch == '"':
            in_double = True
            buf.append(ch)
            i += 1
            continue

        buf.append(ch)
        if ch == "\n":
            flush_line()
        i += 1

    flush_line()
    text = "".join(out)
    if ext in {".ts", ".tsx", ".js"}:
        text = re.sub(r"\{\s*\}", "", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    if text and not text.endswith("\n"):
        text += "\n"
    return text


def process_file(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    if path.suffix == ".py":
        updated = strip_python(path)
    else:
        updated = strip_c_like(path)
    if updated != original:
        path.write_text(updated, encoding="utf-8", newline="\n")
        return True
    return False


def main() -> None:
    changed = 0
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in EXTENSIONS:
            continue
        if should_skip(path):
            continue
        if process_file(path):
            changed += 1
            print(path.relative_to(ROOT))
    print(f"updated {changed} files")


if __name__ == "__main__":
    main()
