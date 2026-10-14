"""전체 스모크 테스트: 단위 테스트 + 각 검사 도구. 하나라도 실패하면 종료 코드 1.

사용법: python run_smoke.py
"""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STEPS = [
    ("unit tests", [sys.executable, "-m", "unittest", "discover", "-s", "tests"]),
    ("state machines", [sys.executable, "-m", "tools.fsm"]),
    ("license ledger", [sys.executable, "-m", "tools.ledger"]),
    ("llm bench (mock)", [sys.executable, "-m", "tools.llm_bench", "--mock", "--limit", "10"]),
]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    failed = []
    for name, cmd in STEPS:
        print(f"== {name}")
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                              env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        tail = (proc.stdout + proc.stderr).strip().splitlines()[-3:]
        print("\n".join("   " + line for line in tail))
        if proc.returncode != 0:
            failed.append(name)
    print("\nRESULT:", "FAIL " + ", ".join(failed) if failed else "OK")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
