from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

ML_API_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ML_API_ROOT / ".env")

VOYAGE_MODEL = "voyage-multilingual-2"
VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
COLLECTION_NAME = "liver_protocols"
DEFAULT_TOP_K = 5

@dataclass
class SearchHit:
    score: float
    text: str
    protocol_name: str
    url: str
    mkb_codes: str
    chunk_index: int

def _env(name: str) -> str:
    return os.environ.get(name, "").strip()

def get_qdrant_client() -> QdrantClient:
    url = _env("QDRANT_URL") or "http://localhost:6333"
    api_key = _env("QDRANT_API_KEY") or None
    return QdrantClient(url=url, api_key=api_key)

def embed_texts(texts: list[str], input_type: str, batch_size: int = 128) -> list[list[float]]:
    api_key = _env("VOYAGE_API_KEY")
    if not api_key:
        raise RuntimeError("VOYAGE_API_KEY is not set")
    if not texts:
        return []

    vectors: list[list[float]] = []
    with httpx.Client(timeout=120.0) as client:
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            for attempt in range(6):
                resp = client.post(
                    VOYAGE_URL,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"input": batch, "model": VOYAGE_MODEL, "input_type": input_type},
                )
                if resp.status_code == 429 and attempt < 5:
                    time.sleep(2**attempt)
                    continue
                resp.raise_for_status()
                data = resp.json()
                vectors.extend([row["embedding"] for row in data["data"]])
                break
            if start + batch_size < len(texts):
                time.sleep(0.1)
    return vectors

def ensure_collection(client: QdrantClient, vector_size: int) -> None:
    if client.collection_exists(COLLECTION_NAME):
        return
    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=qm.VectorParams(size=vector_size, distance=qm.Distance.COSINE),
    )
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="url",
        field_schema=qm.PayloadSchemaType.KEYWORD,
    )

def get_indexed_urls(client: QdrantClient) -> set[str]:
    if not client.collection_exists(COLLECTION_NAME):
        return set()
    urls: set[str] = set()
    offset = None
    while True:
        points, offset = client.scroll(
            collection_name=COLLECTION_NAME,
            limit=256,
            offset=offset,
            with_payload=["url"],
            with_vectors=False,
        )
        for point in points:
            payload = point.payload or {}
            url = payload.get("url")
            if url:
                urls.add(str(url))
        if offset is None:
            break
    return urls

def upsert_chunks(
    client: QdrantClient,
    chunks: list[dict[str, Any]],
    vectors: list[list[float]],
) -> None:
    if not chunks:
        return
    if len(chunks) != len(vectors):
        raise ValueError("chunks and vectors length mismatch")
    ensure_collection(client, len(vectors[0]))
    points = []
    for chunk, vector in zip(chunks, vectors):
        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{chunk['url']}#{chunk['chunk_index']}"))
        points.append(
            qm.PointStruct(
                id=point_id,
                vector=vector,
                payload=chunk,
            )
        )
    client.upsert(collection_name=COLLECTION_NAME, points=points, wait=True)

def search(query: str, top_k: int = DEFAULT_TOP_K) -> list[SearchHit]:
    client = get_qdrant_client()
    if not client.collection_exists(COLLECTION_NAME):
        return []
    query_vec = embed_texts([query], input_type="query", batch_size=1)[0]
    response = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vec,
        limit=top_k,
        with_payload=True,
    )
    hits: list[SearchHit] = []
    for item in response.points:
        payload = item.payload or {}
        hits.append(
            SearchHit(
                score=float(item.score),
                text=str(payload.get("text", "")),
                protocol_name=str(payload.get("protocol_name", "")),
                url=str(payload.get("url", "")),
                mkb_codes=str(payload.get("mkb_codes", "")),
                chunk_index=int(payload.get("chunk_index", 0)),
            )
        )
    return hits

def _snippet(text: str, max_len: int = 200) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1] + "…"

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Search liver protocols in Qdrant")
    parser.add_argument("queries", nargs="*", help="Search queries")
    parser.add_argument("--top-k", type=int, default=3)
    args = parser.parse_args()

    queries = args.queries or [
        "HBsAg положительный, АЛТ выше нормы в 2 раза",
        "хронический гепатит B, показания к терапии",
        "неалкогольная жировая болезнь печени скрининг",
    ]

    for query in queries:
        print(f"\n=== {query} ===")
        hits = search(query, top_k=args.top_k)
        if not hits:
            print("(no results — collection empty or Qdrant unavailable)")
            continue
        for i, hit in enumerate(hits, 1):
            print(f"{i}. score={hit.score:.4f} | {hit.protocol_name}")
            print(f"   url: {hit.url}")
            print(f"   snippet: {_snippet(hit.text)}")

if __name__ == "__main__":
    main()
