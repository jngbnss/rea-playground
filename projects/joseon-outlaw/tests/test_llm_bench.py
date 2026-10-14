"""10번: 평가 세트 구성과 벤치마크 파이프라인(모의 서버) 스모크 테스트."""

import json
import unittest
from collections import Counter

from ai_server.contract import request_schema, validate
from tools.llm_bench import load_cases, percentile, run, start_mock, stream_chat
from tools.make_eval_set import cases as generate


class EvalSet(unittest.TestCase):
    rows = load_cases()

    def test_shape_is_2_npcs_x_4_states_x_5_questions(self):
        self.assertEqual(len(self.rows), 40)
        self.assertEqual(Counter(r["npc_id"] for r in self.rows), {"merchant_yun": 20, "innkeeper_deoksun": 20})
        self.assertEqual(set(Counter((r["npc_id"], r["quest_state"]) for r in self.rows).values()), {5})
        self.assertEqual(len({r["id"] for r in self.rows}), 40)

    def test_requests_are_valid(self):
        for row in self.rows:
            self.assertEqual(validate(row["request"], request_schema()), [], row["id"])

    def test_committed_file_matches_generator(self):
        self.assertEqual(self.rows, json.loads(json.dumps(generate(), ensure_ascii=False)))


class Bench(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server, cls.url = start_mock()
        cls.results, cls.summary = run(cls.url, "mock")

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_mock_injected_failures_are_counted(self):
        s = self.summary
        self.assertEqual(s["cases"], 40)
        self.assertEqual(s["json_parse_rate"], 0.9)      # 10개 중 1개는 잘린 JSON
        self.assertEqual(s["world_violation_rate"], 0.1)  # 10개 중 1개는 금칙어
        self.assertEqual(s["policy_pass_rate"], 0.8)
        self.assertEqual(s["state_reflection_rate"], 1.0)
        self.assertEqual(s["fallback_valid_rate"], 1.0)   # 실패해도 항상 대사가 나간다
        self.assertIsNotNone(s["ttft_p95_s"])

    def test_failed_cases_got_fallback(self):
        for r in self.results:
            self.assertEqual(r["response"]["source"], "llm" if r["llm_ok"] else "fallback", r["id"])

    def test_unreachable_server_is_a_clean_failure(self):
        raw, ttft, total = stream_chat("http://127.0.0.1:9/v1", "x", [{"role": "user", "content": "hi"}], 2.0, True)
        self.assertIsNone(raw)
        self.assertIsNone(ttft)

    def test_percentile(self):
        self.assertEqual(percentile([1, 2, 3, 4, 5], 0.5), 3)
        self.assertAlmostEqual(percentile([1, 2, 3, 4, 5], 0.95), 4.8)
        self.assertIsNone(percentile([], 0.5))


if __name__ == "__main__":
    unittest.main()
