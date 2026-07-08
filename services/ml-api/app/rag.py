from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PROTOCOLS_DIR = ROOT / "protocols"
DEFAULT_INDEX_DIR = ROOT / "data" / "rag_index"
DEFAULT_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 80


@dataclass
class RagHit:
    score: float
    text: str
    source: str
    page: int


def _lazy_imports() -> tuple[Any, Any, Any]:
    try:
        import faiss
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:
        raise ImportError(
            "RAG dependencies missing. Install with: pip install -r requirements-cds.txt"
        ) from exc

    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ImportError(
            "PDF parser missing. Install with: pip install -r requirements-cds.txt"
        ) from exc

    return faiss, SentenceTransformer, PdfReader


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    cleaned = " ".join(text.split())
    if not cleaned:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(start + chunk_size, len(cleaned))
        chunks.append(cleaned[start:end])
        if end == len(cleaned):
            break
        start = max(end - overlap, 0)
    return chunks


def _extract_pdf_chunks(pdf_path: Path) -> list[dict]:
    _, _, PdfReader = _lazy_imports()
    reader = PdfReader(str(pdf_path))
    rows: list[dict] = []
    for page_idx, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        for chunk in _chunk_text(text):
            rows.append(
                {
                    "text": chunk,
                    "source": pdf_path.name,
                    "page": page_idx,
                }
            )
    return rows


class ProtocolRAG:
    def __init__(
        self,
        protocols_dir: str | Path = DEFAULT_PROTOCOLS_DIR,
        index_dir: str | Path = DEFAULT_INDEX_DIR,
        model_name: str = DEFAULT_MODEL_NAME,
    ):
        self.protocols_dir = Path(protocols_dir)
        self.index_dir = Path(index_dir)
        self.model_name = model_name
        self._model = None
        self._index = None
        self._meta: list[dict] = []

    def _ensure_model(self):
        if self._model is None:
            _, SentenceTransformer, _ = _lazy_imports()
            self._model = SentenceTransformer(self.model_name)

    def build_index(self, force: bool = False) -> dict:
        self.protocols_dir.mkdir(parents=True, exist_ok=True)
        self.index_dir.mkdir(parents=True, exist_ok=True)

        index_path = self.index_dir / "faiss.index"
        meta_path = self.index_dir / "meta.json"
        if index_path.exists() and meta_path.exists() and not force:
            self.load_index()
            return {"status": "loaded_existing", "chunks": len(self._meta)}

        pdf_files = sorted(self.protocols_dir.glob("*.pdf"))
        if not pdf_files:
            raise FileNotFoundError(f"No PDF files found in {self.protocols_dir}")

        chunks: list[dict] = []
        for pdf in pdf_files:
            chunks.extend(_extract_pdf_chunks(pdf))

        if not chunks:
            raise RuntimeError("No text extracted from protocol PDFs")

        self._ensure_model()
        faiss, _, _ = _lazy_imports()
        texts = [row["text"] for row in chunks]
        embeddings = self._model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        embeddings = np.asarray(embeddings, dtype=np.float32)
        faiss.normalize_L2(embeddings)

        dim = embeddings.shape[1]
        index = faiss.IndexFlatIP(dim)
        index.add(embeddings)

        faiss.write_index(index, str(index_path))
        with meta_path.open("w", encoding="utf-8") as f:
            json.dump(chunks, f, ensure_ascii=False, indent=2)

        self._index = index
        self._meta = chunks
        return {
            "status": "built",
            "pdf_files": [p.name for p in pdf_files],
            "chunks": len(chunks),
            "index_path": str(index_path),
        }

    def load_index(self) -> None:
        faiss, SentenceTransformer, _ = _lazy_imports()
        index_path = self.index_dir / "faiss.index"
        meta_path = self.index_dir / "meta.json"
        if not index_path.exists() or not meta_path.exists():
            raise FileNotFoundError("RAG index not found. Run build_index() first.")

        self._ensure_model()
        self._index = faiss.read_index(str(index_path))
        with meta_path.open(encoding="utf-8") as f:
            self._meta = json.load(f)

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        if self._index is None or not self._meta:
            self.load_index()

        self._ensure_model()
        faiss, _, _ = _lazy_imports()
        query_vec = self._model.encode([query], convert_to_numpy=True, show_progress_bar=False)
        query_vec = np.asarray(query_vec, dtype=np.float32)
        faiss.normalize_L2(query_vec)

        scores, indices = self._index.search(query_vec, min(top_k, len(self._meta)))
        hits: list[dict] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            row = self._meta[idx]
            hits.append(
                {
                    "score": float(score),
                    "text": row["text"],
                    "source": row["source"],
                    "page": row["page"],
                }
            )
        return hits

    def search_protocol(self, query: str, protocol_order: str, top_k: int = 3) -> list[dict]:
        hits = self.search(query, top_k=max(top_k * 4, 8))
        filtered = [h for h in hits if protocol_order.replace("№", "") in h["source"]]
        return filtered[:top_k] if filtered else hits[:top_k]
