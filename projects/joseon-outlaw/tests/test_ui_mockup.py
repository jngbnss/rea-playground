"""06번: UI 목업이 팔레트 토큰과 서체 제약을 지키는지 검사."""

import re
import unittest
from html.parser import HTMLParser

from ai_server.contract import PROJECT_ROOT, load_json

MOCKUP = PROJECT_ROOT / "ui-mockup" / "index.html"


class TitleText(HTMLParser):
    """class에 f-title이 붙은 요소의 텍스트를 모은다."""

    def __init__(self):
        super().__init__()
        self.depth = 0
        self.texts: list[str] = []

    def handle_starttag(self, tag, attrs):
        classes = dict(attrs).get("class", "") or ""
        if self.depth or "f-title" in classes.split():
            self.depth += 1

    def handle_endtag(self, tag):
        if self.depth:
            self.depth -= 1

    def handle_data(self, data):
        if self.depth and data.strip():
            self.texts.append(data.strip())


def in_ks_x_1001(syllable: str) -> bool:
    # Python의 euc-kr 코덱은 KS X 1001 밖의 음절을 8바이트 조합 시퀀스로 인코딩한다. 2바이트일 때만 완성형 2,350자 안이다.
    return len(syllable.encode("euc-kr")) == 2


class Mockup(unittest.TestCase):
    html = MOCKUP.read_text(encoding="utf-8")

    def test_css_tokens_match_palette(self):
        tokens = dict(re.findall(r"--([a-z_]+):\s*(#[0-9A-Fa-f]{6})", self.html))
        for name, color in load_json("data/palette.json")["colors"].items():
            self.assertEqual(tokens.get(name, "").upper(), color["hex"].upper(), name)

    def test_no_colors_outside_palette_in_css(self):
        css = self.html.split("<style>")[1].split("</style>")[0]
        allowed = {c["hex"].upper() for c in load_json("data/palette.json")["colors"].values()}
        allowed.add("#D0664C")  # 체력 바 그라데이션 하이라이트 (hp_red 계열)
        used = {h.upper() for h in re.findall(r"#[0-9A-Fa-f]{6}\b", css)}
        self.assertEqual(used - allowed, set())

    def test_title_font_strings_fit_song_myung_glyph_set(self):
        # Song Myung은 KS X 1001 한글 2,350자만 있다.
        parser = TitleText()
        parser.feed(self.html)
        self.assertTrue(parser.texts)
        for text in parser.texts:
            for ch in text:
                if "가" <= ch <= "힣":
                    self.assertTrue(in_ks_x_1001(ch), f"'{ch}' in '{text}' is outside Song Myung")

    def test_dialogue_text_comes_from_fallback_policy(self):
        policy = load_json("data/dialogue_policy.json")["policy"]["merchant_yun"]["not_started"]
        self.assertIn(policy["fallback"][0]["text"], self.html)
        for choice in policy["choices"]:
            self.assertIn(choice["label"], self.html)

    def test_ks_x_1001_check(self):
        self.assertTrue(in_ks_x_1001("가"))
        self.assertFalse(in_ks_x_1001("똠"))
        self.assertEqual(sum(in_ks_x_1001(chr(c)) for c in range(0xAC00, 0xD7A4)), 2350)


if __name__ == "__main__":
    unittest.main()
