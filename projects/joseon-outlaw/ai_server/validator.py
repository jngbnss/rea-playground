"""LLM 원문 → 검증된 DialogueResponse. 실패하면 항상 고정 대사로 대체한다.

이 모듈의 출력만 Godot 클라이언트로 나간다. 어떤 입력이 와도 예외 없이 스키마를 만족하는 응답을 돌려주는 것이
계약이다(AI가 실패해도 게임이 멈추지 않는다).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from .contract import load_json, response_schema, validate

# 실측(qwen3:8b)에서 나온 실패 유형: 영어 섞임("드 arrived하오"), 같은 낱말 반복("놈들 놈들 놈들")
LATIN = re.compile(r"[A-Za-z]")
REPEAT = re.compile(r"(?P<word>\S+)(?:\s+(?P=word)){2,}")


def policy() -> dict:
    return load_json("data/dialogue_policy.json")


def extract_json(raw: str) -> dict | None:
    """모델이 코드펜스나 앞뒤 설명을 붙여도 첫 JSON 객체를 꺼낸다."""
    if not isinstance(raw, str):
        return None
    start = raw.find("{")
    while start != -1:
        depth = 0
        in_str = False
        escape = False
        for i in range(start, len(raw)):
            ch = raw[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        obj = json.loads(raw[start : i + 1])
                    except json.JSONDecodeError:
                        break
                    return obj if isinstance(obj, dict) else None
        start = raw.find("{", start + 1)
    return None


def check_response(resp: dict, npc_id: str, quest_state: str) -> list[str]:
    """스키마 + NPC·상태별 정책 + 세계관 금칙어 검사."""
    errors = validate(resp, response_schema())
    if errors:
        return errors
    rules = policy()["policy"][npc_id][quest_state]
    if resp["intent"] not in rules["allowed_intents"]:
        errors.append(f"intent '{resp['intent']}' not allowed for {npc_id}/{quest_state}")
    if "\n" in resp["text"] or "\r" in resp["text"]:
        errors.append("text contains newline")
    if LATIN.search(resp["text"]):
        errors.append("latin letters in text")
    if REPEAT.search(resp["text"]):
        errors.append("repeated word")
    for term in policy()["banned_terms"]:
        if term in resp["text"]:
            errors.append(f"banned term '{term}'")
    return errors


def fallback(npc_id: str, quest_state: str, turn_index: int = 0) -> dict:
    lines = policy()["policy"][npc_id][quest_state]["fallback"]
    line = lines[turn_index % len(lines)]
    return {"text": line["text"], "emotion": line["emotion"], "intent": line["intent"], "source": "fallback"}


@dataclass
class Outcome:
    response: dict
    parsed: bool
    errors: list[str] = field(default_factory=list)

    @property
    def used_fallback(self) -> bool:
        return self.response["source"] == "fallback"


def finalize(raw: str | None, npc_id: str, quest_state: str, turn_index: int = 0) -> Outcome:
    """raw가 None이면 타임아웃·연결 실패로 본다."""
    if raw is None:
        return Outcome(fallback(npc_id, quest_state, turn_index), parsed=False, errors=["no response"])
    obj = extract_json(raw)
    if obj is None:
        return Outcome(fallback(npc_id, quest_state, turn_index), parsed=False, errors=["json parse failed"])
    obj.pop("source", None)  # 모델이 source를 사칭하지 못하게 서버가 덮어쓴다.
    if isinstance(obj.get("text"), str):
        obj["text"] = obj["text"].strip()
    errors = check_response(obj, npc_id, quest_state)
    if errors:
        return Outcome(fallback(npc_id, quest_state, turn_index), parsed=True, errors=errors)
    return Outcome({**obj, "source": "llm"}, parsed=True)
