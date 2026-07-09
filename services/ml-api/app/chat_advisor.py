from __future__ import annotations

import os
from typing import Any

import httpx

from app.cds import PROTOCOLS

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")

SYSTEM_BASE = """Ты — клинический ассистент LiverScreening для врачей и пациентов в ПМСП Казахстана.
Отвечай кратко на русском (3–6 предложений), без диагнозов — только скрининг и направление к врачу.

ОБЯЗАТЕЛЬНО хотя бы раз в ответе используй формулировку вида:
«Согласно протоколу №{номер} ({название})…»

Закреплённые клинические протоколы МЗ РК:
- №523 — МАСЖБП (неалкогольная жировая болезнь печени)
- №1082 — Алкогольная болезнь печени (АБП)
- №1071 — Хронический вирусный гепатит B у взрослых
- №1056 — Хронический гепатит C у взрослых

Опирайся на FIB-4/APRI для фиброза, HBsAg/Anti-HCV для вирусного гепатита.
В конце добавь: «Это не заменяет очный приём врача.»"""


def _protocol_catalog() -> str:
    lines = []
    for key, p in PROTOCOLS.items():
        lines.append(f"- №{p['code']} — {p['name']} ({p['title']})")
    return "\n".join(lines)


def _rag_snippets(query: str, top_k: int = 3) -> str:
    try:
        from app.protocol_rag import search

        hits = search(query, top_k=top_k)
    except Exception:
        return ""
    if not hits:
        return ""
    parts: list[str] = []
    for hit in hits:
        snippet = " ".join(hit.text.split())[:400]
        parts.append(f"«{hit.protocol_name}»: {snippet}")
    return "\n\n".join(parts)


def _build_system_prompt(user_message: str) -> str:
    prompt = f"{SYSTEM_BASE}\n\nСправочник:\n{_protocol_catalog()}"
    rag = _rag_snippets(user_message)
    if rag:
        prompt += f"\n\nРелевантные выдержки из индекса протоколов:\n{rag}"
    return prompt


def advise(messages: list[dict[str, str]], user_message: str) -> dict[str, Any]:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    anthropic_messages: list[dict[str, str]] = []
    for msg in messages[-8:]:
        role = msg.get("role", "user")
        if role not in ("user", "assistant"):
            continue
        content = str(msg.get("content", "")).strip()
        if content:
            anthropic_messages.append({"role": role, "content": content})
    if not anthropic_messages or anthropic_messages[-1]["role"] != "user":
        anthropic_messages.append({"role": "user", "content": user_message})

    payload = {
        "model": DEFAULT_MODEL,
        "max_tokens": 600,
        "system": _build_system_prompt(user_message),
        "messages": anthropic_messages,
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    with httpx.Client(timeout=60.0) as client:
        resp = client.post(ANTHROPIC_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    blocks = data.get("content") or []
    text_parts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
    reply = "\n".join(text_parts).strip() or "Не удалось сформировать ответ."

    protocols_cited: list[str] = []
    for p in PROTOCOLS.values():
        code = p["code"]
        if f"№{code}" in reply or code in reply:
            protocols_cited.append(f"№{code} — {p['name']}")

    return {
        "reply": reply,
        "protocols_cited": protocols_cited,
        "model": data.get("model", DEFAULT_MODEL),
    }
