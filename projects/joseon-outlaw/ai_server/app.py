"""Validated local-NPC dialogue API. Game progression never depends on this service."""

from __future__ import annotations

import json
import os
import urllib.request
from threading import Lock

from fastapi import FastAPI, HTTPException

from .contract import request_schema, validate
from .prompt import build_messages
from .validator import fallback, finalize

MODEL = os.environ.get("JOSEON_AI_MODEL", "qwen3:4b-instruct")
PROVIDER = os.environ.get("JOSEON_AI_PROVIDER", "ollama")
OLLAMA_URL = os.environ.get("JOSEON_OLLAMA_URL", "http://127.0.0.1:11434/v1/chat/completions")
MAX_TIMEOUT_SECONDS = 2.0

app = FastAPI(title="JOSEON OUTLAW Dialogue", version="1.0.0")
_cache: dict[tuple[str, str], dict] = {}
_cache_lock = Lock()


def _mock_raw(npc_id: str, quest_state: str) -> str:
    response = fallback(npc_id, quest_state)
    return json.dumps({key: response[key] for key in ("text", "emotion", "intent")}, ensure_ascii=False)


def _ollama_raw(request: dict) -> str | None:
    timeout = min(MAX_TIMEOUT_SECONDS, request.get("timeout_ms", 2000) / 1000)
    body = {
        "model": MODEL,
        "messages": build_messages(request),
        "stream": False,
        "temperature": 0.7,
        "max_tokens": 160,
        "reasoning_effort": "none",
        "response_format": {"type": "json_object"},
    }
    http_request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer local"},
    )
    try:
        with urllib.request.urlopen(http_request, timeout=timeout) as response:
            payload = json.load(response)
        return payload["choices"][0]["message"]["content"]
    except (OSError, TimeoutError, KeyError, ValueError, json.JSONDecodeError):
        return None


@app.get("/health")
def health() -> dict:
    with _cache_lock:
        cache_entries = len(_cache)
    return {"status": "ok", "provider": PROVIDER, "model": MODEL, "cache_entries": cache_entries}


@app.post("/v1/dialogue")
def dialogue(request: dict) -> dict:
    errors = validate(request, request_schema())
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    npc_id = request["npc_id"]
    quest_state = request["quest"]["state"]
    cache_key = (npc_id, quest_state)
    cacheable = not request.get("player_input")
    if cacheable:
        with _cache_lock:
            cached = _cache.get(cache_key)
        if cached is not None:
            return cached

    raw = _mock_raw(npc_id, quest_state) if PROVIDER == "mock" else _ollama_raw(request)
    response = finalize(raw, npc_id, quest_state).response
    if cacheable:
        with _cache_lock:
            _cache[cache_key] = response
    return response
