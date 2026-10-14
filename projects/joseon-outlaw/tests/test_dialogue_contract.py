"""11번: AI 요청·응답 JSON 스키마와 검증기 스모크 테스트."""

import json
import unittest

from ai_server.contract import load_json, request_schema, response_schema, validate
from ai_server.prompt import build_messages
from ai_server.validator import check_response, extract_json, finalize, policy

NPCS = ["merchant_yun", "innkeeper_deoksun"]
STATES = ["not_started", "accepted", "item_recovered", "completed"]

VALID_REQUEST = {
    "schema_version": "1.0",
    "request_id": "req_0001abcd",
    "npc_id": "merchant_yun",
    "quest": {"id": "lost_ledger", "state": "accepted"},
    "player_input": {"text": "도적은 몇 명이오?"},
    "history": [{"role": "npc", "text": "고갯마루 너머 서낭당이오."}],
    "world": {"bandits_defeated": 0, "player_location": "village"},
    "timeout_ms": 3000,
}


class SchemaSync(unittest.TestCase):
    def test_request_and_response_enums_match_data(self):
        req = request_schema()["properties"]
        self.assertEqual(set(req["npc_id"]["enum"]), set(load_json("data/npcs.json")["npcs"]))
        self.assertEqual(set(req["quest"]["properties"]["state"]["enum"]),
                         set(load_json("data/quest_lost_ledger.json")["states"]))
        self.assertEqual(set(req["npc_id"]["enum"]), set(policy()["policy"]))

    def test_policy_covers_every_npc_state_and_is_valid(self):
        intents = set(response_schema()["properties"]["intent"]["enum"])
        for npc in NPCS:
            for state in STATES:
                rules = policy()["policy"][npc][state]
                self.assertTrue(rules["fallback"], f"{npc}/{state} has no fallback")
                self.assertTrue(set(rules["allowed_intents"]) <= intents)
                for line in rules["fallback"]:
                    resp = {k: line[k] for k in ("text", "emotion", "intent")}
                    self.assertEqual(check_response(resp, npc, state), [], f"{npc}/{state}: {line['text']}")

    def test_only_quest_giver_offers_quest(self):
        for state in STATES:
            self.assertNotIn("offer_quest", policy()["policy"]["innkeeper_deoksun"][state]["allowed_intents"])


class RequestValidation(unittest.TestCase):
    def test_valid_request(self):
        self.assertEqual(validate(VALID_REQUEST, request_schema()), [])

    def test_rejects_bad_requests(self):
        cases = {
            "unknown npc": {**VALID_REQUEST, "npc_id": "king"},
            "unknown state": {**VALID_REQUEST, "quest": {"id": "lost_ledger", "state": "failed"}},
            "history too long": {**VALID_REQUEST, "history": [{"role": "npc", "text": "x"}] * 7},
            "extra field": {**VALID_REQUEST, "set_quest_state": "completed"},
            "bad id": {**VALID_REQUEST, "request_id": "a b"},
            "bool as int": {**VALID_REQUEST, "world": {"bandits_defeated": True}},
        }
        for name, req in cases.items():
            self.assertNotEqual(validate(req, request_schema()), [], name)

    def test_prompt_contains_state_and_allowed_intents(self):
        messages = build_messages(VALID_REQUEST)
        system = messages[0]["content"]
        self.assertIn("윤 행수", system)
        self.assertIn("give_hint", system)
        self.assertNotIn("offer_quest", system)
        self.assertIn("따라 말하지 말고", system)
        self.assertEqual(messages[-1], {"role": "user", "content": "도적은 몇 명이오?"})


class ResponseValidation(unittest.TestCase):
    def test_accepts_good_llm_output_wrapped_in_fence(self):
        raw = '설명입니다\n```json\n{"text": "서낭당 쪽을 살피시오.", "emotion": "worried", "intent": "give_hint"}\n```'
        out = finalize(raw, "merchant_yun", "accepted")
        self.assertFalse(out.used_fallback, out.errors)
        self.assertEqual(out.response["source"], "llm")

    def test_falls_back_on_every_failure_mode(self):
        cases = {
            "timeout": None,
            "not json": "도적은 북쪽에 있소.",
            "broken json": '{"text": "x", "emotion": ',
            "wrong intent for state": json.dumps({"text": "의뢰를 하나 주겠소.", "emotion": "neutral", "intent": "offer_quest"}),
            "unknown emotion": json.dumps({"text": "흠.", "emotion": "smug", "intent": "small_talk"}),
            "too long": json.dumps({"text": "가" * 91, "emotion": "neutral", "intent": "small_talk"}),
            "newline": json.dumps({"text": "첫줄\n둘째줄", "emotion": "neutral", "intent": "small_talk"}),
            "banned term": json.dumps({"text": "나는 인공지능이오.", "emotion": "neutral", "intent": "small_talk"}),
            "latin letters": json.dumps({"text": "장부가 드 arrived하오?", "emotion": "neutral", "intent": "small_talk"}),
            "repetition": json.dumps({"text": "그거야 놈들 놈들 놈들 놈들", "emotion": "sad", "intent": "small_talk"}),
            "tries to change state": json.dumps({"text": "좋소.", "emotion": "happy", "intent": "small_talk", "quest_state": "completed"}),
            "array": "[1, 2]",
        }
        for name, raw in cases.items():
            out = finalize(raw, "merchant_yun", "accepted")
            self.assertTrue(out.used_fallback, name)
            self.assertEqual(validate(out.response, response_schema()), [], name)
            self.assertEqual(check_response({k: out.response[k] for k in ("text", "emotion", "intent")},
                                            "merchant_yun", "accepted"), [], name)

    def test_model_cannot_claim_fallback_source(self):
        raw = json.dumps({"text": "흠.", "emotion": "neutral", "intent": "small_talk", "source": "fallback"})
        self.assertEqual(finalize(raw, "merchant_yun", "accepted").response["source"], "llm")

    def test_extract_json_skips_braces_in_prose(self):
        raw = '중괄호 { 는 무시 } 그리고 {"text": "a}b", "emotion": "neutral", "intent": "greet"}'
        self.assertEqual(extract_json(raw)["text"], "a}b")


if __name__ == "__main__":
    unittest.main()
