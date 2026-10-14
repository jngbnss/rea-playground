"""상태 기계 정적 검사와 이벤트 재생. 퀘스트(data/quest_lost_ledger.json)와 NPC(data/npc_fsm.json)가 같은 형식을 쓴다.

사용법: python -m tools.fsm
"""

from __future__ import annotations

import sys
from collections import deque

from ai_server.contract import load_json

WILDCARD = "*"


def expand(machine: dict) -> list[dict]:
    """'*' 전이를 터미널을 제외한 모든 상태로 펼친다."""
    terminal = set(machine.get("terminal", []))
    out = []
    for t in machine["transitions"]:
        if t["from"] == WILDCARD:
            out += [{**t, "from": s} for s in machine["states"] if s not in terminal]
        else:
            out.append(t)
    return out


def check(name: str, machine: dict) -> list[str]:
    states = set(machine["states"])
    terminal = set(machine.get("terminal", []))
    transitions = expand(machine)
    errors: list[str] = []

    if machine["initial"] not in states:
        errors.append(f"{name}: initial '{machine['initial']}' undefined")
    errors += [f"{name}: terminal '{s}' undefined" for s in terminal - states]

    seen = set()
    for t in transitions:
        for end in ("from", "to"):
            if t[end] not in states:
                errors.append(f"{name}: {end} '{t[end]}' undefined ({t['event']})")
        key = (t["from"], t["event"], t.get("guard"))
        if key in seen:
            errors.append(f"{name}: duplicate transition {key}")
        seen.add(key)
        if t["from"] in terminal:
            errors.append(f"{name}: terminal '{t['from']}' has outgoing '{t['event']}'")

    graph: dict[str, set[str]] = {s: set() for s in states}
    for t in transitions:
        if t["from"] in graph:
            graph[t["from"]].add(t["to"])

    reachable = _reach(machine["initial"], graph)
    errors += [f"{name}: '{s}' unreachable from initial" for s in sorted(states - reachable)]
    errors += [f"{name}: '{s}' is a dead end" for s in sorted(states - terminal) if not graph[s]]

    # 터미널이 있으면 모든 상태에서 터미널에 도달할 수 있어야 한다 (게임이 갇히지 않는다).
    if terminal:
        for s in sorted(states):
            if not (_reach(s, graph) & terminal):
                errors.append(f"{name}: '{s}' cannot reach a terminal state")
    return errors


def _reach(start: str, graph: dict[str, set[str]]) -> set[str]:
    seen = {start}
    queue = deque([start])
    while queue:
        for nxt in graph.get(queue.popleft(), ()):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen


def replay(machine: dict, events: list[str], state: str | None = None) -> list[str]:
    """이벤트를 순서대로 적용한 상태 이력. 정의되지 않은 이벤트는 무시한다(퀘스트 계약과 같은 규칙)."""
    state = state or machine["initial"]
    table = {(t["from"], t["event"]): t["to"] for t in expand(machine)}
    history = [state]
    for event in events:
        state = table.get((state, event), state)
        history.append(state)
    return history


def all_machines() -> dict[str, dict]:
    machines = {"quest:lost_ledger": load_json("data/quest_lost_ledger.json")}
    for key, m in load_json("data/npc_fsm.json")["machines"].items():
        machines[f"npc:{key}"] = m
    return machines


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    failed = False
    for name, machine in all_machines().items():
        errors = check(name, machine)
        failed |= bool(errors)
        status = "OK" if not errors else "FAIL"
        print(f"[{status}] {name}: {len(machine['states'])} states, {len(expand(machine))} transitions")
        for e in errors:
            print("   -", e)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
