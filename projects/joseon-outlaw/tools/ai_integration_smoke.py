"""Start the real FastAPI service and prove its HTTP and Godot client boundaries."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
import urllib.error
import urllib.request

from .godot_smoke import DEFAULT_BIN, PROJECT_ROOT

BASE_URL = "http://127.0.0.1:8765"


def _request(path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        BASE_URL + path,
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def _dialogue_request() -> dict:
    return {
        "schema_version": "1.0",
        "request_id": "smoke_ai_0001",
        "npc_id": "merchant_yun",
        "quest": {"id": "lost_ledger", "state": "accepted"},
        "history": [],
        "world": {"bandits_defeated": 0, "player_location": "village"},
        "timeout_ms": 2000,
    }


def main() -> int:
    environment = {**os.environ, "JOSEON_AI_PROVIDER": "mock"}
    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "ai_server.app:app", "--host", "127.0.0.1", "--port", "8765", "--log-level", "warning"],
        cwd=PROJECT_ROOT,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
    )
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                status, health = _request("/health")
                if status == 200:
                    break
            except OSError:
                time.sleep(0.1)
        else:
            raise SystemExit("FastAPI server did not become healthy")

        status, response = _request("/v1/dialogue", _dialogue_request())
        if status != 200 or response.get("source") != "llm" or not response.get("text"):
            raise SystemExit(f"Dialogue endpoint failed: {status} {response}")
        invalid = _dialogue_request()
        invalid["npc_id"] = "unknown"
        invalid_status, _ = _request("/v1/dialogue", invalid)
        if invalid_status != 422:
            raise SystemExit(f"Invalid contract was not rejected: {invalid_status}")

        godot_bin = Path(os.environ.get("GODOT_BIN", DEFAULT_BIN))
        command = [
            str(godot_bin), "--headless", "--path", str(PROJECT_ROOT / "game"), "--",
            "--smoke-phase=6", "--require-ai", f"--ai-url={BASE_URL}/v1/dialogue",
        ]
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", timeout=90)
        output = completed.stdout + completed.stderr
        print(output.strip())
        if completed.returncode != 0 or "AI_DIALOGUE_SMOKE" not in output or "cache=hit" not in output:
            raise SystemExit(f"Godot AI integration failed: {completed.returncode}")
        print(f"AI_INTEGRATION_OK health={health['status']} contract=422 source={response['source']} godot_cache=hit")
        return 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
