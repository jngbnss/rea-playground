"""Run the complete Godot adventure repeatedly and reject any intermittent failure."""

from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

from .godot_smoke import DEFAULT_BIN, PROJECT_ROOT


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--phase", type=int, default=7)
    parser.add_argument("--godot", type=Path, default=Path(os.environ.get("GODOT_BIN", DEFAULT_BIN)))
    args = parser.parse_args()
    if args.runs < 1:
        raise SystemExit("--runs must be positive")
    for run_index in range(1, args.runs + 1):
        command = [str(args.godot), "--headless", "--path", str(PROJECT_ROOT / "game"), "--", f"--smoke-phase={args.phase}"]
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", timeout=90)
        output = completed.stdout + completed.stderr
        marker = f"SMOKE_OK phase={args.phase}"
        if completed.returncode != 0 or marker not in output or "COMPLETE_RUN_SMOKE" not in output:
            print(output.strip())
            raise SystemExit(f"Repeated run {run_index}/{args.runs} failed")
        print(f"REPEAT_RUN_OK run={run_index}/{args.runs}")
    print(f"REPEAT_SMOKE_OK runs={args.runs} phase={args.phase}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
