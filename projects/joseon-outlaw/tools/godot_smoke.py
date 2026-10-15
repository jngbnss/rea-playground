"""Run the real Godot project and require its phase smoke marker."""

from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parents[1]
DEFAULT_BIN = REPO_ROOT / ".tmp" / "godot" / "Godot_v4.7.2-stable_win64_console.exe"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", type=int, required=True)
    parser.add_argument("--godot", type=Path, default=Path(os.environ.get("GODOT_BIN", DEFAULT_BIN)))
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()

    if not args.godot.is_file():
        raise SystemExit(f"Godot executable not found: {args.godot}")

    command = [
        str(args.godot),
        "--headless",
        "--path",
        str(PROJECT_ROOT / "game"),
        "--",
        f"--smoke-phase={args.phase}",
    ]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", timeout=args.timeout)
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout.decode("utf-8", errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or "")
        stderr = error.stderr.decode("utf-8", errors="replace") if isinstance(error.stderr, bytes) else (error.stderr or "")
        print((stdout + stderr).strip())
        raise SystemExit(f"Godot smoke timed out after {args.timeout}s") from error
    output = completed.stdout + completed.stderr
    print(output.strip())
    marker = f"SMOKE_OK phase={args.phase}"
    if completed.returncode != 0 or marker not in output:
        raise SystemExit(f"Godot smoke failed: code={completed.returncode}, marker={marker!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
