"""Export the Godot project for Windows and launch the exported build."""

from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parents[1]
DEFAULT_BIN = REPO_ROOT / ".tmp" / "godot" / "Godot_v4.7.2-stable_win64_console.exe"
DEFAULT_OUTPUT = REPO_ROOT / ".tmp" / "build" / "JOSEON_OUTLAW.exe"


def run(command: list[str], timeout: int = 120) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", timeout=timeout)
    print((completed.stdout + completed.stderr).strip())
    if completed.returncode != 0:
        raise SystemExit(f"Command failed ({completed.returncode}): {command}")
    return completed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--godot", type=Path, default=Path(os.environ.get("GODOT_BIN", DEFAULT_BIN)))
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--phase", type=int, default=1)
    args = parser.parse_args()

    if not args.godot.is_file():
        raise SystemExit(f"Godot executable not found: {args.godot}")
    args.output.parent.mkdir(parents=True, exist_ok=True)

    run([
        str(args.godot), "--headless", "--path", str(PROJECT_ROOT / "game"),
        "--export-release", "Windows Desktop", str(args.output),
    ], timeout=300)
    if not args.output.is_file():
        raise SystemExit(f"Export did not create {args.output}")

    completed = run([str(args.output), "--headless", "--", f"--smoke-phase={args.phase}"])
    marker = f"SMOKE_OK phase={args.phase}"
    if marker not in completed.stdout + completed.stderr:
        raise SystemExit(f"Exported build did not emit {marker!r}")
    print(f"EXPORT_OK phase={args.phase} path={args.output} bytes={args.output.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
