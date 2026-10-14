"""14번: 라이선스 대장 템플릿과 검사기 스모크 테스트."""

import unittest

from tools.ledger import COLUMNS, check, credits, read

GOOD = {
    "id": "nanum-myeongjo", "name": "나눔명조", "category": "font",
    "source_url": "https://example.org/font", "version_or_commit": "2.0", "downloaded_on": "2026-10-14",
    "license": "SIL OFL 1.1", "license_url": "https://openfontlicense.org", "commercial_ok": "yes",
    "modification_ok": "yes", "redistribution_in_build": "yes", "attribution_required": "yes",
    "attribution_text": "Nanum Myeongjo © NAVER", "modified": "no", "sha256": "a" * 64,
    "in_final_build": "yes", "status": "approved", "owner": "quest-dialogue-ui", "notes": "",
}


class LedgerFile(unittest.TestCase):
    def test_committed_ledger_is_valid(self):
        header, rows = read()
        self.assertEqual(check(header, rows), [])
        self.assertTrue(rows, "ledger should list at least the candidates")


class LedgerRules(unittest.TestCase):
    def assertFlags(self, row, needle):
        errors = check(COLUMNS, [row])
        self.assertTrue(any(needle in e for e in errors), f"expected '{needle}' in {errors}")

    def test_good_row_passes_and_appears_in_credits(self):
        self.assertEqual(check(COLUMNS, [GOOD]), [])
        self.assertIn("Nanum Myeongjo © NAVER", credits([GOOD]))

    def test_rules(self):
        self.assertFlags({**GOOD, "license": "CC BY-NC 4.0"}, "NC/ND")
        self.assertFlags({**GOOD, "status": "candidate"}, "only approved")
        self.assertFlags({**GOOD, "sha256": ""}, "approved needs sha256")
        self.assertFlags({**GOOD, "commercial_ok": "unknown"}, "cannot leave commercial_ok unknown")
        self.assertFlags({**GOOD, "attribution_text": ""}, "attribution_text required")
        self.assertFlags({**GOOD, "modified": "yes", "modification_ok": "no"}, "modified but")
        self.assertFlags({**GOOD, "source_url": "http://x"}, "https")
        self.assertFlags({**GOOD, "category": "misc"}, "category")
        self.assertFlags({**GOOD, "owner": "intern"}, "not a role")
        self.assertEqual(len(check(COLUMNS, [GOOD, GOOD])), 1)  # duplicate id
        self.assertEqual(check(COLUMNS[:-1], [GOOD])[0][:15], "header mismatch")

    def test_candidates_may_be_incomplete(self):
        row = {**GOOD, "status": "candidate", "in_final_build": "no", "sha256": "", "version_or_commit": "",
               "commercial_ok": "unknown"}
        self.assertEqual(check(COLUMNS, [row]), [])


if __name__ == "__main__":
    unittest.main()
