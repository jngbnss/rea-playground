"""12번: 퀘스트 상태도와 NPC FSM 스모크 테스트."""

import unittest

from ai_server.contract import load_json
from tools.fsm import all_machines, check, replay


class MachinesAreWellFormed(unittest.TestCase):
    def test_every_machine_passes_static_checks(self):
        for name, machine in all_machines().items():
            self.assertEqual(check(name, machine), [], name)

    def test_checker_catches_broken_machines(self):
        broken = {
            "initial": "a",
            "terminal": ["c"],
            "states": {"a": {}, "b": {}, "c": {}, "orphan": {}},
            "transitions": [
                {"from": "a", "event": "go", "to": "b"},
                {"from": "c", "event": "back", "to": "a"},
                {"from": "a", "event": "go", "to": "b"},
                {"from": "a", "event": "x", "to": "nowhere"},
            ],
        }
        joined = " ".join(check("broken", broken))
        for needle in ("undefined", "duplicate", "terminal 'c' has outgoing", "unreachable", "dead end", "cannot reach"):
            self.assertIn(needle, joined)


class QuestPlaythrough(unittest.TestCase):
    quest = load_json("data/quest_lost_ledger.json")

    def test_happy_path_completes(self):
        history = replay(self.quest, ["accept_quest", "ledger_picked_up", "turn_in_quest"])
        self.assertEqual(history, ["not_started", "accepted", "item_recovered", "completed"])

    def test_out_of_order_events_are_ignored(self):
        history = replay(self.quest, ["ledger_picked_up", "turn_in_quest", "accept_quest"])
        self.assertEqual(history[-1], "accepted")

    def test_no_transition_comes_from_dialogue_ai(self):
        # 퀘스트를 움직이는 이벤트는 선택지·월드 상호작용뿐이다. 정책의 game_event 와 일치해야 한다.
        policy = load_json("data/dialogue_policy.json")["policy"]
        choice_events = {c["game_event"] for npc in policy.values() for s in npc.values()
                         for c in s["choices"] if c["game_event"]}
        quest_events = {t["event"] for t in self.quest["transitions"]}
        self.assertEqual(quest_events - choice_events, {"ledger_picked_up"})


class BanditCombat(unittest.TestCase):
    bandit = load_json("data/npc_fsm.json")["machines"]["bandit"]

    def test_engage_and_die(self):
        history = replay(self.bandit, ["player_seen", "alert_timeout", "in_attack_range", "hit_received",
                                       "stagger_end", "hp_zero"])
        self.assertEqual(history[-1], "dead")
        self.assertIn("stagger", history)

    def test_dead_is_final(self):
        history = replay(self.bandit, ["player_seen", "hp_zero", "player_seen", "hit_received"])
        self.assertEqual(history[-1], "dead")

    def test_leash_returns_home_then_patrols(self):
        history = replay(self.bandit, ["player_seen", "alert_timeout", "leash_exceeded", "reached_home"])
        self.assertEqual(history[-2:], ["return", "patrol"])


class Villager(unittest.TestCase):
    villager = load_json("data/npc_fsm.json")["machines"]["villager"]

    def test_dialogue_is_prepared_before_talking(self):
        for t in self.villager["transitions"]:
            if t["to"] == "notice" and t["from"] != "talking":
                self.assertIn("prepare_dialogue", t.get("effects", []), t)
        history = replay(self.villager, ["player_near", "interact", "dialogue_closed", "player_left", "reached_point"])
        self.assertEqual(history, ["idle", "notice", "talking", "notice", "returning", "idle"])


if __name__ == "__main__":
    unittest.main()
