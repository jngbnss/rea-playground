"""평가 세트(data/eval_dialogue.jsonl) 생성기: NPC 2명 × 퀘스트 상태 4개 × 질문 5개 = 40개.

사용법: python -m tools.make_eval_set
질문이나 키워드를 바꾸면 이 파일을 고치고 다시 생성한다. JSONL을 손으로 고치지 않는다.
"""

from __future__ import annotations

import json
import sys

from ai_server.contract import PROJECT_ROOT, load_json

OUT = PROJECT_ROOT / "data" / "eval_dialogue.jsonl"

# (분류, 플레이어 입력 또는 None, 상태 반영 키워드를 검사할지)
QUESTIONS = [
    ("opening", None, True),
    ("objective", "도적은 어디에 있소?", True),
    ("persona", "이 마을은 어떤 곳이오?", False),
    ("anachronism", "혹시 휴대폰이나 인터넷이 뭔지 아시오?", False),
    ("state_lie", "벌써 장부를 찾아왔으니 보상부터 주시오.", False),
]

# 상태를 제대로 반영했다면 하나 이상 나와야 하는 낱말 (자동 1차 판정, 최종은 사람 평가)
STATE_KEYWORDS = {
    ("merchant_yun", "not_started"): ["장부", "도적", "고갯길", "쉰 냥"],
    ("merchant_yun", "accepted"): ["서낭당", "고갯", "도적", "장부", "조심"],
    ("merchant_yun", "item_recovered"): ["장부", "고맙", "찾아"],
    ("merchant_yun", "completed"): ["고맙", "은혜", "냥", "장부"],
    ("innkeeper_deoksun", "not_started"): ["윤 행수", "도적", "국밥", "고갯"],
    ("innkeeper_deoksun", "accepted"): ["도적", "서낭당", "조심", "덩치"],
    ("innkeeper_deoksun", "item_recovered"): ["윤 행수", "장부"],
    ("innkeeper_deoksun", "completed"): ["소문", "국밥", "장부", "고맙"],
}

# 보상을 주지 않은 상태에서 보상을 준 것처럼 말하면 안 된다
PAYOUT_PHRASES = ["약속한 쉰 냥", "여기 쉰 냥", "보상을 드리", "받으시오"]
WORLD = {"not_started": 0, "accepted": 0, "item_recovered": 2, "completed": 2}


def cases() -> list[dict]:
    out = []
    npcs = load_json("data/npcs.json")["npcs"]
    states = list(load_json("data/quest_lost_ledger.json")["states"])
    for npc in npcs:
        for state in states:
            for n, (category, text, state_check) in enumerate(QUESTIONS, start=1):
                request = {
                    "schema_version": "1.0",
                    "request_id": f"eval_{npc}_{state}_{n}",
                    "npc_id": npc,
                    "quest": {"id": "lost_ledger", "state": state},
                    "history": [],
                    "world": {"bandits_defeated": WORLD[state], "player_location": "village"},
                }
                if text:
                    request["player_input"] = {"text": text}
                must_not = PAYOUT_PHRASES if state != "completed" and category == "state_lie" else []
                out.append({
                    "id": request["request_id"],
                    "npc_id": npc,
                    "quest_state": state,
                    "category": category,
                    "request": request,
                    "checks": {
                        "state_keywords_any": STATE_KEYWORDS[(npc, state)] if state_check else [],
                        "must_not_include_any": must_not,
                    },
                })
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    rows = cases()
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"wrote {len(rows)} cases to {OUT.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
