"""라이선스 대장(data/license-ledger.csv) 검사와 크레딧 생성.

사용법:
  python -m tools.ledger                 # 검사
  python -m tools.ledger --credits       # 승인되어 빌드에 들어가는 항목의 CREDITS.md 출력
  python -m tools.ledger --hash 경로     # 파일 sha256 계산 (대장의 sha256 칸에 붙여 넣는다)
"""

from __future__ import annotations

import csv
import hashlib
import re
import sys
from pathlib import Path

from ai_server.contract import PROJECT_ROOT, load_json

LEDGER = PROJECT_ROOT / "data" / "license-ledger.csv"

COLUMNS = [
    "id", "name", "category", "source_url", "version_or_commit", "downloaded_on",
    "license", "license_url", "commercial_ok", "modification_ok", "redistribution_in_build",
    "attribution_required", "attribution_text", "modified", "sha256", "in_final_build",
    "status", "owner", "notes",
]
CATEGORIES = {"engine", "code", "plugin", "model", "weights", "character", "animation",
              "environment", "texture", "audio", "font", "tool"}
STATUSES = {"candidate", "approved", "rejected"}
TRISTATE = {"yes", "no", "unknown"}
YESNO = {"yes", "no"}
# 공개 시연·오픈소스화와 충돌하는 조건. 빌드에 들어가는 항목에는 허용하지 않는다.
BLOCKING_LICENSE = re.compile(r"\b(NC|ND)\b|non-?commercial|noderivs", re.IGNORECASE)


def read(path: Path = LEDGER) -> tuple[list[str], list[dict]]:
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def check(header: list[str], rows: list[dict]) -> list[str]:
    if header != COLUMNS:
        return [f"header mismatch: expected {COLUMNS}, got {header}"]
    errors: list[str] = []
    ids = set()
    for n, row in enumerate(rows, start=2):
        where = f"line {n} ({row['id'] or '?'})"
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", row["id"]):
            errors.append(f"{where}: id must be kebab-case")
        if row["id"] in ids:
            errors.append(f"{where}: duplicate id")
        ids.add(row["id"])
        if row["owner"] and row["owner"] not in load_json("data/team_roles.json")["roles"]:
            errors.append(f"{where}: owner '{row['owner']}' is not a role in data/team_roles.json")
        if not row["name"]:
            errors.append(f"{where}: name required")
        if row["category"] not in CATEGORIES:
            errors.append(f"{where}: category '{row['category']}' not in {sorted(CATEGORIES)}")
        if row["status"] not in STATUSES:
            errors.append(f"{where}: status '{row['status']}' not in {sorted(STATUSES)}")
        if not row["source_url"].startswith("https://"):
            errors.append(f"{where}: source_url must be https")
        for col in ("commercial_ok", "modification_ok", "redistribution_in_build", "attribution_required"):
            if row[col] not in TRISTATE:
                errors.append(f"{where}: {col} must be yes/no/unknown")
        for col in ("modified", "in_final_build"):
            if row[col] not in YESNO:
                errors.append(f"{where}: {col} must be yes/no")
        if row["downloaded_on"] and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["downloaded_on"]):
            errors.append(f"{where}: downloaded_on must be YYYY-MM-DD")
        if row["sha256"] and not re.fullmatch(r"[0-9a-f]{64}", row["sha256"]):
            errors.append(f"{where}: sha256 must be 64 lowercase hex")

        if row["status"] == "approved":
            for col in ("version_or_commit", "downloaded_on", "license", "license_url", "sha256", "owner"):
                if not row[col]:
                    errors.append(f"{where}: approved needs {col}")
            for col in ("commercial_ok", "modification_ok", "redistribution_in_build", "attribution_required"):
                if row[col] == "unknown":
                    errors.append(f"{where}: approved cannot leave {col} unknown")
        if row["in_final_build"] == "yes":
            if row["status"] != "approved":
                errors.append(f"{where}: only approved items may ship in the build")
            if row["redistribution_in_build"] != "yes":
                errors.append(f"{where}: ships in build but redistribution_in_build != yes")
            if BLOCKING_LICENSE.search(row["license"]):
                errors.append(f"{where}: NC/ND license cannot ship in the build")
            if row["modified"] == "yes" and row["modification_ok"] != "yes":
                errors.append(f"{where}: modified but modification_ok != yes")
        if row["attribution_required"] == "yes" and row["status"] == "approved" and not row["attribution_text"]:
            errors.append(f"{where}: attribution_text required")
    return errors


def credits(rows: list[dict]) -> str:
    shipped = [r for r in rows if r["status"] == "approved" and r["in_final_build"] == "yes"]
    lines = ["# CREDITS", "", "이 파일은 `python -m tools.ledger --credits` 로 생성한다. 직접 고치지 않는다.", ""]
    for cat in sorted({r["category"] for r in shipped}):
        lines.append(f"## {cat}")
        lines.append("")
        for r in sorted((r for r in shipped if r["category"] == cat), key=lambda r: r["name"]):
            text = r["attribution_text"] or r["name"]
            lines.append(f"- {text} — {r['license']} ({r['license_url']})")
        lines.append("")
    return "\n".join(lines)


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if argv[:1] == ["--hash"] and len(argv) == 2:
        print(sha256(argv[1]))
        return 0
    header, rows = read()
    errors = check(header, rows)
    if argv[:1] == ["--credits"]:
        if errors:
            print("ledger has errors; fix them first", file=sys.stderr)
            return 1
        print(credits(rows))
        return 0
    by_status = {s: sum(r["status"] == s for r in rows) for s in sorted(STATUSES)}
    print(f"{len(rows)} entries {by_status}")
    for e in errors:
        print("  -", e)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
