"""02·03·07번: 팔레트 대비, 스토리보드 시간·퀘스트 흐름, 사운드 큐 교차 검사."""

import unittest

from ai_server.contract import load_json
from tools.fsm import replay
from tools.ledger import read


def luminance(hex_color: str) -> float:
    channels = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


class Palette(unittest.TestCase):
    palette = load_json("data/palette.json")

    def test_contrast_pairs_meet_wcag(self):
        colors = {k: v["hex"] for k, v in self.palette["colors"].items()}
        for pair in self.palette["contrast_pairs"]:
            ratio = contrast(colors[pair["fg"]], colors[pair["bg"]])
            self.assertGreaterEqual(ratio, pair["min"], f"{pair['fg']} on {pair['bg']} = {ratio:.2f} ({pair['use']})")

    def test_contrast_formula(self):
        self.assertAlmostEqual(contrast("#000000", "#FFFFFF"), 21.0, places=3)


class Storyboard(unittest.TestCase):
    board = load_json("data/storyboard.json")
    quest = load_json("data/quest_lost_ledger.json")
    policy = load_json("data/dialogue_policy.json")["policy"]
    cues = load_json("data/audio_cues.json")["cues"]

    def test_total_target_is_8_to_10_minutes(self):
        low, high = self.board["target_total_s"]
        total = sum(b["duration_s"]["target"] for b in self.board["beats"])
        self.assertTrue(low <= total <= high, f"target total {total}s")
        for b in self.board["beats"]:
            d = b["duration_s"]
            self.assertTrue(d["min"] <= d["target"] <= d["max"], b["id"])

    def test_beats_follow_the_quest_state_machine(self):
        state = self.quest["initial"]
        for beat in self.board["beats"]:
            self.assertEqual(beat["quest_state"], state, f"{beat['id']} expects {beat['quest_state']}, quest is {state}")
            visited = replay(self.quest, beat["events"], state)
            for line in beat["dialogue"]:
                self.assertIn(line["state"], visited, f"{beat['id']} dialogue state")
                self.assertIn(line["npc"], self.policy)
            state = visited[-1]
        self.assertEqual(state, "completed")

    def test_every_dialogue_beat_has_fallback_lines(self):
        for beat in self.board["beats"]:
            for line in beat["dialogue"]:
                self.assertTrue(self.policy[line["npc"]][line["state"]]["fallback"], beat["id"])

    def test_audio_references_exist(self):
        for beat in self.board["beats"]:
            for cue in beat["audio"]:
                self.assertIn(cue, self.cues, beat["id"])

    def test_three_visual_target_shots(self):
        shots = [b for b in self.board["beats"] if b["visual_beat"]]
        self.assertEqual(len(shots), 3)


class AudioCues(unittest.TestCase):
    cues = load_json("data/audio_cues.json")

    def test_sources_are_in_ledger_and_not_rejected(self):
        _, rows = read()
        status = {r["id"]: r["status"] for r in rows}
        for cue_id, cue in self.cues["cues"].items():
            if cue["source"] == "team-recording":
                continue
            self.assertIn(cue["source"], status, cue_id)
            self.assertNotEqual(status[cue["source"]], "rejected", cue_id)

    def test_buses_and_priorities(self):
        for cue_id, cue in self.cues["cues"].items():
            self.assertIn(cue["bus"], self.cues["buses"], cue_id)
            self.assertIn(cue["priority"], {"P0", "P1", "P2"}, cue_id)


if __name__ == "__main__":
    unittest.main()
