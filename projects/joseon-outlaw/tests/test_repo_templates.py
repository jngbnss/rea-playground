"""13번: 게임 저장소 템플릿(.gitattributes, .gitignore, CODEOWNERS)을 실제 git으로 검사."""

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from ai_server.contract import PROJECT_ROOT, load_json

TEMPLATES = PROJECT_ROOT / "repo-templates"


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8").stdout


class GitBehaviour(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="jo-repo-"))
        git(cls.tmp, "init", "-q")
        for name in (".gitattributes", ".gitignore"):
            shutil.copy(TEMPLATES / name, cls.tmp / name)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def attr(self, path: str, name: str) -> str:
        return git(self.tmp, "check-attr", name, "--", path).rsplit(": ", 1)[-1].strip()

    def test_binary_assets_go_to_lfs(self):
        for path in ("game/assets/characters/hero.glb", "game/assets/audio/bgm_village.ogg",
                     "game/assets/fonts/GowunBatang-Regular.ttf", "art/source/hanok_kit.blend",
                     "game/assets/environment/roof_albedo.png", "ai_server/models/model.gguf"):
            self.assertEqual(self.attr(path, "filter"), "lfs", path)

    def test_godot_text_files_are_lf_text(self):
        for path in ("game/scenes/player/player.tscn", "game/autoload/quest_manager.gd",
                     "game/assets/characters/hero.glb.import", "game/autoload/quest_manager.gd.uid"):
            self.assertEqual(self.attr(path, "eol"), "lf", path)
            self.assertNotEqual(self.attr(path, "filter"), "lfs", path)

    def test_ignore_rules(self):
        def ignored(path: str) -> bool:
            return subprocess.run(["git", "check-ignore", "-q", path], cwd=self.tmp).returncode == 0

        for path in (".godot/imported/x.ctex", "assets/_private/sonniss/hit.wav", "ai_server/models/q4.gguf",
                     "build/JoseonOutlaw.exe"):
            self.assertTrue(ignored(path), path)
        for path in ("game/assets/characters/hero.glb.import", "game/autoload/a.gd.uid", "game/project.godot"):
            self.assertFalse(ignored(path), path)


class CodeOwners(unittest.TestCase):
    lines = [l.split() for l in (TEMPLATES / ".github" / "CODEOWNERS").read_text(encoding="utf-8").splitlines()
             if l.strip() and not l.startswith("#")]
    roles = load_json("data/team_roles.json")["roles"]

    def test_owners_are_known_teams(self):
        teams = {r["github_team"] for r in self.roles.values()}
        for parts in self.lines:
            for owner in parts[1:]:
                self.assertIn(owner, teams, parts[0])

    def test_every_role_owns_something(self):
        used = {o for parts in self.lines for o in parts[1:]}
        for name, role in self.roles.items():
            self.assertIn(role["github_team"], used, name)

    def test_every_scene_area_has_a_single_owner(self):
        paths = [p[0] for p in self.lines]
        for area in ("/game/scenes/player/", "/game/scenes/combat/", "/game/scenes/world/", "/game/scenes/ui/"):
            self.assertEqual(paths.count(area), 1, area)

    def test_review_pairs_cover_all_roles(self):
        pairs = load_json("data/team_roles.json")["review_pairs"]
        self.assertEqual(sorted(r for pair in pairs for r in pair), sorted(self.roles))


if __name__ == "__main__":
    unittest.main()
