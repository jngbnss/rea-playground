"""DialogueRequest → OpenAI 호환 chat messages. Ollama와 llama.cpp server 모두 /v1/chat/completions 를 지원한다."""

from __future__ import annotations

import json

from .contract import load_json, request_schema, validate
from .validator import policy


def build_messages(request: dict) -> list[dict]:
    errors = validate(request, request_schema())
    if errors:
        raise ValueError(f"invalid DialogueRequest: {errors}")

    npcs = load_json("data/npcs.json")
    quest = load_json("data/quest_lost_ledger.json")
    npc = npcs["npcs"][request["npc_id"]]
    state = request["quest"]["state"]
    rules = policy()["policy"][request["npc_id"]][state]
    example = rules["fallback"][0]

    world = request.get("world", {})
    facts = [quest["states"][state]["prompt_context"]]
    if "bandits_defeated" in world:
        facts.append(f"쓰러진 도적 수: {world['bandits_defeated']}/2")

    system = "\n".join(
        [
            f"너는 '{npc['name']}'이다. {npc['role']} 나이 {npc['age']}.",
            f"성격: {', '.join(npc['personality'])}.",
            f"말투: {npc['speech_style']}",
            f"배경: {npcs['world_brief']}",
            "알고 있는 사실: " + " / ".join(npc["knows"]),
            "현재 상황: " + " ".join(facts),
            "규칙:",
            "- 조선 후기 산골 마을 사람처럼 말한다. 현대 용어, 게임 용어, 영어를 쓰지 않는다.",
            "- 알고 있는 사실과 현재 상황에 없는 일을 지어내지 않는다.",
            "- 나그네가 모르는 낱말을 쓰면 그 낱말을 따라 말하지 말고, 무슨 소리인지 모르겠다고만 한다.",
            "- 정해진 말투를 처음부터 끝까지 지킨다.",
            "- 대사는 한두 문장, 90자 이내, 줄바꿈 없이.",
            f"- intent는 다음 중 하나만: {', '.join(rules['allowed_intents'])}",
            "- emotion은 neutral, happy, worried, angry, sad, surprised, grateful 중 하나.",
            "- 반드시 JSON 객체 하나만 출력한다. 다른 글은 쓰지 않는다.",
            "출력 예시: " + json.dumps({k: example[k] for k in ("text", "emotion", "intent")}, ensure_ascii=False),
        ]
    )

    messages = [{"role": "system", "content": system}]
    for turn in request["history"]:
        role = "user" if turn["role"] == "player" else "assistant"
        messages.append({"role": role, "content": turn["text"]})

    player_input = request.get("player_input", {})
    if "text" in player_input:
        user = player_input["text"]
    elif "choice_id" in player_input:
        labels = {c["id"]: c["label"] for c in rules["choices"]}
        user = labels.get(player_input["choice_id"], "(말없이 바라본다)")
    else:
        user = "(나그네가 다가온다)"
    messages.append({"role": "user", "content": user})
    return messages
