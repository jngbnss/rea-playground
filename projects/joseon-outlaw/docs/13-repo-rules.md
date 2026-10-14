# 13. 브랜치·PR·씬 소유권 규칙

> 상태: 초안. 게임 저장소를 만들 때 [`repo-templates/`](../repo-templates/)를 저장소 루트에 그대로 복사한다.
> 검사: `tests/test_repo_templates.py`가 임시 git 저장소를 만들어 LFS 대상, 줄바꿈, 무시 규칙, CODEOWNERS를 실제로 확인한다.

## 1. 저장소 구조

```text
joseon-outlaw/
├─ game/                 Godot 프로젝트 (project.godot)
│  ├─ addons/            플러그인 (태그·커밋 고정)
│  ├─ autoload/          GameState, QuestManager, AIClient, Metrics
│  ├─ scenes/
│  │  ├─ player/  combat/  npc/bandit/  npc/villager/  world/  ui/
│  ├─ data/              퀘스트·NPC·대사 정책 (.tres, JSON에서 생성)
│  └─ assets/            characters/ animations/ environment/ audio/ fonts/
├─ ai_server/            FastAPI (이 문서 묶음의 ai_server/ 가 시작점)
├─ art/source/           .blend, .kra 원본 (LFS)
├─ docs/                 이 문서들, license-ledger.csv
└─ .github/              CODEOWNERS, PR 템플릿, CI
```

## 2. 브랜치

- **`main`은 항상 실행 가능한 상태.** 직접 푸시를 막는다(브랜치 보호: PR 필수, 승인 1명, CI 통과).
- 브랜치 이름: `역할/짧은-설명`. 예: `combat-ai/attack-token`, `world-art/hanok-roof-kit`.
- **PR은 1~2일 분량, 브랜치는 3일을 넘기지 않는다.** 넘으면 쪼개거나 기능 플래그 뒤에 숨겨서 먼저 합친다.
- 병합은 **Squash merge**. `main` 이력 한 줄이 PR 하나다.
- 매주 금요일 `main`에서 Windows 빌드를 만들고 `v0.<주차>` 태그를 단다.

## 3. PR 규칙

[`pull_request_template.md`](../repo-templates/.github/pull_request_template.md)의 체크리스트를 따른다. 핵심은 다음과 같다.

- 리뷰는 **2인 짝**이 먼저 본다: 플레이어↔전투, 월드 아트↔퀘스트·UI, AI 백엔드↔테크 리드 (`data/team_roles.json`의 `review_pairs`).
- 화면이 바뀌는 PR은 **변경 전·후 스크린샷**을 첨부한다. 아트 품질은 리뷰에서 지킨다.
- 새 에셋이나 의존성은 같은 PR에서 라이선스 대장 행을 추가한다.
- 5주차 이후에는 버그 수정만 받는다.

## 4. 씬 소유권

Godot `.tscn`은 텍스트지만 **두 사람이 동시에 고치면 병합이 사실상 불가능하다.** 그래서 다음을 지킨다.

- 각 씬 폴더에 **소유자 한 명**을 정한다([`CODEOWNERS`](../repo-templates/.github/CODEOWNERS)). 다른 사람은 그 씬을 열어 저장하지 않는다. 바꿀 것이 있으면 소유자에게 요청하거나 하위 씬으로 분리한다.
- 큰 씬은 **하위 씬으로 쪼갠다.** 마을은 `village.tscn` 하나가 아니라 `village_market.tscn`, `village_inn.tscn`처럼 나누고, 메인 씬은 인스턴스만 배치한다.
- 다른 사람의 씬에 기능을 붙일 때는 씬을 고치지 않고 **autoload 시그널**로 연결한다. 예: 퀘스트는 `QuestManager.quest_state_changed`만 듣는다.
- 공유 리소스(`Theme`, `AnimationLibrary`)도 소유자가 있다. UI 테마는 퀘스트·UI 담당, 애니메이션 라이브러리는 플레이어 담당이다.

## 5. 파일 규칙 (`.gitattributes`, `.gitignore`)

| 대상 | 처리 |
|---|---|
| `.gd .tscn .tres .godot .import .uid .gdshader` | 텍스트, LF 고정 |
| `.glb .fbx .blend .png .exr .wav .ogg .ttf .gguf` 등 | **Git LFS** |
| `.godot/` | 무시 (에디터 캐시) |
| `*.import`, `*.uid` | **커밋한다** (Godot 4 권장. 빠지면 다른 PC에서 참조가 깨진다) |
| `assets/_private/` | 무시. Sonniss, Mixamo 원본처럼 공개 저장소에 둘 수 없는 파일 |
| `ai_server/models/` | 무시. LLM 가중치는 저장소 밖에서 받는다 |

처음 클론할 때 `git lfs install`이 필요하다.

## 6. CI (1주차에 구성)

- `python -m unittest discover -s tests` (이 문서 묶음의 계약 테스트)
- `python -m tools.ledger` (라이선스 대장)
- gdUnit4 헤드리스 실행
- `main` 병합 시 Windows 내보내기 빌드를 아티팩트로 저장
