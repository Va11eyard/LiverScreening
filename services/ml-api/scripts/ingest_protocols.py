#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import io
import logging
import re
import sys
from pathlib import Path

import httpx
from pypdf import PdfReader

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.protocol_rag import COLLECTION_NAME, embed_texts, get_indexed_urls, get_qdrant_client, upsert_chunks

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CSV = REPO_ROOT / "protocols.csv"
PRIORITY_IDS = {523, 1082, 1071, 1056, 599}
CHUNK_TOKENS = 400
OVERLAP_TOKENS = 50
EMBED_BATCH = 128

def est_tokens(text: str) -> int:
    return max(1, len(text) // 4)

def chunk_paragraphs(text: str, chunk_tokens: int = CHUNK_TOKENS, overlap_tokens: int = OVERLAP_TOKENS) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
    if not paragraphs:
        cleaned = " ".join(text.split())
        return [cleaned] if cleaned else []

    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0

    def flush() -> None:
        nonlocal current, current_tokens
        if not current:
            return
        chunk_text = "\n\n".join(current).strip()
        if chunk_text:
            chunks.append(chunk_text)
        if overlap_tokens > 0 and current:
            overlap: list[str] = []
            overlap_count = 0
            for para in reversed(current):
                overlap.insert(0, para)
                overlap_count += est_tokens(para)
                if overlap_count >= overlap_tokens:
                    break
            current = overlap
            current_tokens = sum(est_tokens(p) for p in current)
        else:
            current = []
            current_tokens = 0

    for para in paragraphs:
        para_tokens = est_tokens(para)
        if para_tokens > chunk_tokens:
            flush()
            words = para.split()
            buf: list[str] = []
            buf_tokens = 0
            for word in words:
                buf.append(word)
                buf_tokens += est_tokens(word + " ")
                if buf_tokens >= chunk_tokens:
                    chunks.append(" ".join(buf))
                    overlap_words = buf[-max(1, overlap_tokens * 4) :]
                    buf = overlap_words
                    buf_tokens = sum(est_tokens(w + " ") for w in buf)
            if buf:
                chunks.append(" ".join(buf))
            current = []
            current_tokens = 0
            continue

        if current_tokens + para_tokens > chunk_tokens and current:
            flush()
        current.append(para)
        current_tokens += para_tokens

    flush()
    return chunks

def download_pdf(url: str, timeout: float = 60.0) -> bytes:
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.content

def extract_pdf_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            parts.append(text)
    return "\n\n".join(parts)

def load_protocol_rows(csv_path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with csv_path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    def sort_key(row: dict[str, str]) -> tuple[int, int]:
        pid = int(row.get("id") or 0)
        priority = 0 if pid in PRIORITY_IDS else 1
        return priority, pid

    rows.sort(key=sort_key)
    return rows

def ingest_protocol(
    row: dict[str, str],
    client,
    indexed_urls: set[str],
    dry_run: bool,
) -> int:
    url = (row.get("url") or "").strip()
    if not url:
        return 0
    if url in indexed_urls:
        logger.info("skip (indexed): %s", row.get("name", url))
        return 0

    protocol_id = row.get("id", "")
    protocol_name = row.get("name", "")
    mkb_codes = row.get("mkb_codes", "")

    if dry_run:
        logger.info("dry-run: would ingest %s | %s", protocol_id, protocol_name)
        return 0

    try:
        pdf_bytes = download_pdf(url)
        text = extract_pdf_text(pdf_bytes)
    except Exception as exc:
        logger.warning("failed %s (%s): %s", protocol_id, protocol_name, exc)
        return 0

    chunks = chunk_paragraphs(text)
    if not chunks:
        logger.warning("no text: %s (%s)", protocol_id, protocol_name)
        return 0

    payloads = [
        {
            "url": url,
            "protocol_id": protocol_id,
            "protocol_name": protocol_name,
            "mkb_codes": mkb_codes,
            "chunk_index": i,
            "text": chunk,
        }
        for i, chunk in enumerate(chunks)
    ]

    vectors: list[list[float]] = []
    texts = [p["text"] for p in payloads]
    for start in range(0, len(texts), EMBED_BATCH):
        batch = texts[start : start + EMBED_BATCH]
        vectors.extend(embed_texts(batch, input_type="document", batch_size=EMBED_BATCH))

    upsert_chunks(client, payloads, vectors)
    indexed_urls.add(url)
    logger.info("ingested %s | %s | chunks=%d", protocol_id, protocol_name, len(chunks))
    return len(chunks)

def main() -> None:
    parser = argparse.ArgumentParser(description=f"Ingest protocols into Qdrant collection {COLLECTION_NAME}")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--limit", type=int, default=0, help="Max protocols to process (0 = all)")
    parser.add_argument("--priority-only", action="store_true", help="Only priority protocol IDs")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.csv.exists():
        raise SystemExit(f"CSV not found: {args.csv}")

    rows = load_protocol_rows(args.csv)
    if args.priority_only:
        rows = [r for r in rows if int(r.get("id") or 0) in PRIORITY_IDS]

    if args.limit > 0:
        rows = rows[: args.limit]

    client = get_qdrant_client()
    indexed_urls = get_indexed_urls(client)
    logger.info("already indexed urls: %d", len(indexed_urls))
    logger.info("protocols to process: %d", len(rows))

    total_chunks = 0
    for row in rows:
        total_chunks += ingest_protocol(row, client, indexed_urls, args.dry_run)

    logger.info("done. new chunks=%d collection=%s", total_chunks, COLLECTION_NAME)

if __name__ == "__main__":
    main()
