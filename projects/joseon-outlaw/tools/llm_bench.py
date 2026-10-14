"""로컬 LLM 대사 벤치마크. OpenAI 호환 /v1/chat/completions (Ollama, llama.cpp server)에 스트리밍으로 요청해
첫 토큰 시간, 전체 응답 시간, JSON 성공률, 정책 통과율, 상태 반영률, 세계관 위반을 잰다.

사용법:
  python -m tools.llm_bench --mock                                   # 내장 모의 서버로 파이프라인 점검
  python -m tools.llm_bench --base-url http://127.0.0.1:11434/v1 --model <ollama 모델>    # Ollama
  python -m tools.llm_bench --base-url http://127.0.0.1:8080/v1  --model local            # llama.cpp server
  python -m tools.llm_bench --rescore 결과.jsonl                         # 저장된 원문을 현재 검증기로 다시 채점
옵션: --runs N (케이스당 반복), --limit N, --out 결과.jsonl, --timeout 초, --no-json-mode,
      --no-think (Qwen3 등 사고형 모델: reasoning_effort="none" 으로 사고 과정을 끈다. Ollama에서 확인)
"""

from __future__ import annotations

import argparse
import json
import shutil
import statistics
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from ai_server.contract import PROJECT_ROOT
from ai_server.prompt import build_messages
from ai_server.validator import finalize, policy

EVAL_SET = PROJECT_ROOT / "data" / "eval_dialogue.jsonl"


def load_cases(limit: int | None = None) -> list[dict]:
    with open(EVAL_SET, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    return rows[:limit] if limit else rows


def stream_chat(base_url: str, model: str, messages: list[dict], timeout: float, json_mode: bool,
                no_think: bool = False) -> tuple[str | None, float | None, float]:
    """(원문, 첫 토큰까지 초, 전체 초). 실패하면 원문 None."""
    body = {"model": model, "messages": messages, "stream": True, "temperature": 0.7, "max_tokens": 160}
    if no_think:
        body["reasoning_effort"] = "none"
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer local"},
    )
    start = time.perf_counter()
    first = None
    parts: list[str] = []
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            for raw_line in resp:
                if time.perf_counter() - start > timeout:
                    return None, first, time.perf_counter() - start
                line = raw_line.decode("utf-8").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                delta = json.loads(data)["choices"][0].get("delta", {}).get("content") or ""
                if delta and first is None:
                    first = time.perf_counter() - start
                parts.append(delta)
    except Exception:  # 연결 실패, 타임아웃, 잘못된 스트림 모두 fallback 대상
        return None, first, time.perf_counter() - start
    return "".join(parts), first, time.perf_counter() - start


def score(case: dict, raw: str | None) -> dict:
    out = finalize(raw, case["npc_id"], case["quest_state"])
    text = out.response["text"]
    checks = case["checks"]
    llm_ok = not out.used_fallback
    state_ok = None
    if checks["state_keywords_any"] and llm_ok:
        state_ok = any(k in text for k in checks["state_keywords_any"])
    forbidden = [p for p in checks["must_not_include_any"] if p in text] if llm_ok else []
    return {
        "parsed": out.parsed,
        "llm_ok": llm_ok,
        "errors": out.errors,
        "state_ok": state_ok,
        "forbidden_hits": forbidden,
        "world_violation": any(e.startswith("banned term") for e in out.errors),
        "response": out.response,
    }


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    k = (len(values) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (k - lo)


def summarize(results: list[dict]) -> dict:
    n = len(results)
    ttft = [r["ttft_s"] for r in results if r["ttft_s"] is not None]
    total = [r["total_s"] for r in results if r["raw"] is not None]
    state = [r["state_ok"] for r in results if r["state_ok"] is not None]
    rate = lambda xs: round(sum(xs) / len(xs), 3) if xs else None  # noqa: E731
    return {
        "cases": n,
        "ttft_p50_s": _r(percentile(ttft, 0.5)), "ttft_p95_s": _r(percentile(ttft, 0.95)),
        "total_p50_s": _r(percentile(total, 0.5)), "total_p95_s": _r(percentile(total, 0.95)),
        "no_response_rate": rate([r["raw"] is None for r in results]),
        "json_parse_rate": rate([r["parsed"] for r in results]),
        "policy_pass_rate": rate([r["llm_ok"] for r in results]),
        "state_reflection_rate": rate(state),
        "world_violation_rate": rate([r["world_violation"] for r in results]),
        "forbidden_payout_hits": sum(bool(r["forbidden_hits"]) for r in results),
        "fallback_valid_rate": rate([bool(r["response"]["text"]) for r in results]),
    }


def _r(x: float | None) -> float | None:
    return round(x, 3) if x is not None else None


class GpuSampler(threading.Thread):
    """nvidia-smi가 있으면 1초마다 VRAM 사용량(MiB)을 기록한다."""

    def __init__(self):
        super().__init__(daemon=True)
        self.samples: list[int] = []
        self.stop = threading.Event()
        self.available = shutil.which("nvidia-smi") is not None

    def run(self):
        while self.available and not self.stop.is_set():
            try:
                out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                                     capture_output=True, text=True, timeout=5).stdout
                self.samples.append(sum(int(x) for x in out.split()))
            except Exception:
                self.available = False
            self.stop.wait(1.0)


# ---------- 모의 서버: 실제 모델 없이 파이프라인을 점검한다 ----------

class MockHandler(BaseHTTPRequestHandler):
    counter = 0
    lock = threading.Lock()

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        first = body["messages"][0]
        if first["role"] != "system":  # 워밍업 요청: 집계 순번을 쓰지 않는다
            reply = "안녕하시오."
        else:
            with MockHandler.lock:
                MockHandler.counter += 1
                n = MockHandler.counter
            system = first["content"]
            npc = "merchant_yun" if system.startswith("너는 '윤 행수'") else "innkeeper_deoksun"
            state = next(s for s in ("item_recovered", "not_started", "completed", "accepted")
                         if _STATE_HINTS[s] in system)
            line = policy()["policy"][npc][state]["fallback"][0]
            reply = json.dumps({k: line[k] for k in ("text", "emotion", "intent")}, ensure_ascii=False)
            if n % 10 == 0:
                reply = reply[: len(reply) // 2]  # 잘린 JSON
            elif n % 10 == 5:
                reply = json.dumps({"text": "나는 인공지능이오.", "emotion": "neutral", "intent": "small_talk"},
                                   ensure_ascii=False)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        time.sleep(0.02)
        for i in range(0, len(reply), 8):
            chunk = {"choices": [{"delta": {"content": reply[i : i + 8]}}]}
            self.wfile.write(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode("utf-8"))
            self.wfile.flush()
        self.wfile.write(b"data: [DONE]\n\n")


_STATE_HINTS = {
    "not_started": "아직 의뢰를 받지 않았다",
    "accepted": "아직 찾지 못했다",
    "item_recovered": "아직 윤 행수에게 건네지 않았다",
    "completed": "쉰 냥을 보상으로 주었다",
}


def start_mock() -> tuple[ThreadingHTTPServer, str]:
    MockHandler.counter = 0
    server = ThreadingHTTPServer(("127.0.0.1", 0), MockHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}/v1"


def warm_up(base_url: str, model: str, no_think: bool, timeout: float = 180.0) -> float:
    """측정 전에 모델을 메모리에 올린다. 콜드 스타트(실측 약 55초)가 측정 타임아웃에 걸려 전 케이스가 실패하는 것을 막는다."""
    _, _, total = stream_chat(base_url, model, [{"role": "user", "content": "안녕"}], timeout, False, no_think)
    return total


def run(base_url: str, model: str, runs: int = 1, limit: int | None = None, timeout: float = 8.0,
        json_mode: bool = True, no_think: bool = False) -> tuple[list[dict], dict]:
    warmup_s = warm_up(base_url, model, no_think)
    gpu = GpuSampler()
    gpu.start()
    results = []
    for case in load_cases(limit):
        for r in range(runs):
            raw, ttft, total = stream_chat(base_url, model, build_messages(case["request"]), timeout, json_mode, no_think)
            results.append({"id": case["id"], "run": r, "category": case["category"], "raw": raw,
                            "ttft_s": ttft, "total_s": total, **score(case, raw)})
    gpu.stop.set()
    summary = summarize(results)
    summary["vram_peak_mib"] = max(gpu.samples) if gpu.samples else None
    summary["warmup_s"] = round(warmup_s, 1)
    summary["model"] = model
    return results, summary


def rescore(path: Path) -> dict:
    """모델을 다시 돌리지 않고, 저장된 원문(raw)을 현재 검증기·평가 세트로 다시 채점한다."""
    cases = {c["id"]: c for c in load_cases()}
    results = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            old = json.loads(line)
            results.append({**old, **score(cases[old["id"]], old["raw"])})
    return summarize(results)


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:11434/v1")
    ap.add_argument("--model", default="mock")
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--timeout", type=float, default=8.0)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--mock", action="store_true")
    ap.add_argument("--no-json-mode", action="store_true")
    ap.add_argument("--no-think", action="store_true")
    ap.add_argument("--rescore", type=Path)
    args = ap.parse_args(argv)

    if args.rescore:
        print(json.dumps(rescore(args.rescore), ensure_ascii=False, indent=2))
        return 0

    server = None
    if args.mock:
        server, args.base_url = start_mock()
    try:
        results, summary = run(args.base_url, args.model, args.runs, args.limit, args.timeout,
                               not args.no_json_mode, args.no_think)
    finally:
        if server:
            server.shutdown()
    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            for row in results:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
