# JOSEON OUTLAW

Godot 4.7.2로 구현한 3인칭 조선 활극 수직 슬라이스. 윤 행수의 장부 의뢰를 받아 산길의 도적 둘을 제압하고 장부를 되찾아 보상받는 흐름을 처음부터 끝까지 플레이할 수 있다. 외부 게임 에셋 없이 절차 생성 메시·UI·사운드를 사용한다.

![조선 아웃로우 실게임](docs/evidence/game/design-upgrade.png)

## 자동 검사와 미리보기

- [GitHub Actions](https://github.com/jngbnss/rea-playground/actions/workflows/joseon-outlaw.yml): Python·Godot·FastAPI 통합 검사, 10회 연속 완주, Windows 빌드 아티팩트
- [웹 미리보기](https://jngbnss.github.io/rea-playground/): `main` 검사 통과 후 GitHub Pages에 UI 목업 배포

## 구현 범위

- 3인칭 이동·달리기·점프·카메라 충돌과 검 전투
- 해 질 녘 조선 마을·산길·도적 소굴, 창호 조명·등불·모닥불·안개·겹산
- Song Myung·Gowun Batang 기반 먹색 HUD와 한지 의뢰서·대화창
- 의뢰 수락·장부 회수·지름길·제출·보상·엔딩, 체크포인트 부활
- FastAPI/Ollama 상태별 대사 캐시와 2초 제한·정책 검증·고정 대사 fallback
- 튜토리얼, 일시정지, 음량, 성능 로그, 절차 생성 배경음

## 항목별 산출물

| # | 항목 | 문서 | 데이터·도구 | 검사 |
|---|---|---|---|---|
| 2 | 아트 디렉션 | [02-art-direction](docs/02-art-direction.md) | `data/palette.json` | 색 대비(WCAG) |
| 3 | 시연 스토리보드 | [03-storyboard](docs/03-storyboard.md) | `data/storyboard.json` | 총 8~10분, 퀘스트 상태 흐름, 대사·사운드 참조 |
| 4 | 캐릭터·애니메이션 후보 | [04-character-animation](docs/04-character-animation.md) | 라이선스 대장 | 대장 검사 |
| 5 | 환경 에셋 후보 | [05-environment-assets](docs/05-environment-assets.md) | 라이선스 대장 | 대장 검사 |
| 6 | UI 시안·서체 | [06-ui-design](docs/06-ui-design.md) | `ui-mockup/index.html` | 팔레트 토큰, 제목 서체 글리프 범위 |
| 7 | 사운드·BGM | [07-audio-plan](docs/07-audio-plan.md) | `data/audio_cues.json` | 출처가 대장에 있고 제외 항목이 아닌지 |
| 9 | Godot·플러그인 호환성 | [09-godot-compat](docs/09-godot-compat.md) | 라이선스 대장 | 대장 검사 |
| 10 | LLM 벤치마크 | [10-llm-benchmark-plan](docs/10-llm-benchmark-plan.md) | `tools/llm_bench.py`, `data/eval_dialogue.jsonl` | 모의 서버 집계 + **qwen3:8b 실측** |
| 11 | AI 요청·응답 스키마 | (이 README 아래) | `schemas/`, `ai_server/` | 스키마·정책 검증, 모든 실패 유형에서 고정 대사로 대체 |
| 12 | 퀘스트 상태도·NPC FSM | [12-quest-npc-fsm](docs/12-quest-npc-fsm.md) | `data/quest_lost_ledger.json`, `data/npc_fsm.json` | 도달성, 막다른 상태, 이벤트 재생 |
| 13 | 브랜치·PR·씬 소유권 | [13-repo-rules](docs/13-repo-rules.md) | `repo-templates/` | 임시 git 저장소로 LFS·무시 규칙 확인 |
| 14 | 라이선스 대장 | [14-license-ledger](docs/14-license-ledger.md) | `data/license-ledger.csv`, `tools/ledger.py` | 승인·빌드 포함 규칙, NC/ND 차단 |

## 실행

Python 3.11 이상과 Godot 4.7.2 표준 빌드를 사용한다.

```bash
cd projects/joseon-outlaw
python -m pip install -r requirements.txt
python run_smoke.py
python -m tools.godot_smoke --phase 7
python -m tools.ai_integration_smoke
python -m tools.repeat_godot_smoke --phase 7 --runs 10
python -m tools.export_windows --phase 7
```

게임은 `godot --path game`으로 실행한다. 조작은 `WASD`, `Shift`, `Space`, 마우스, 좌클릭 공격, `E` 상호작용, `P` 일시정지, `F1` 도움말, `[`/`]` 음량이다.

AI 대사는 선택 기능이다. `ollama serve`와 `qwen3:4b-instruct`를 준비한 뒤 `python -m uvicorn ai_server.app:app --host 127.0.0.1 --port 8765`를 실행한다. 서버가 없거나 2초를 넘기거나 검증에 실패해도 고정 대사로 전체 게임을 완주할 수 있다.

에디터에서는 `game/project.godot`을 연다. 기준 PC와 도구 버전은 [`docs/environment.md`](docs/environment.md), 단계별 완료 기준은 [`docs/implementation-checklist.md`](docs/implementation-checklist.md), 구현 중 오류는 [`docs/implementation-errors.md`](docs/implementation-errors.md)에 기록한다.

외부 서체 라이선스와 고지는 [`CREDITS.md`](CREDITS.md), 원본 해시·승인 상태는 [`data/license-ledger.csv`](data/license-ledger.csv)에 있다.

## 11. AI 계약 요약

- 요청 [`schemas/dialogue_request.schema.json`](schemas/dialogue_request.schema.json): NPC, 퀘스트 상태, 최근 6턴, 읽기 전용 월드 사실
- 응답 [`schemas/dialogue_response.schema.json`](schemas/dialogue_response.schema.json): `text`(90자, 줄바꿈 금지), `emotion`, `intent`만 있다. **상태를 바꾸는 필드는 없다**(`additionalProperties: false`).
- [`data/dialogue_policy.json`](data/dialogue_policy.json): NPC·상태별 허용 intent, 고정 대사, 선택지. 퀘스트를 움직이는 것은 `game_event`가 붙은 선택지뿐이다.
- [`ai_server/validator.py`](ai_server/validator.py) `finalize()`는 어떤 입력에도 스키마를 만족하는 응답을 돌려준다. 타임아웃, JSON 깨짐, 허용되지 않은 intent, 금칙어, 영어 섞임, 낱말 반복이면 고정 대사로 대체한다.
- [`ai_server/prompt.py`](ai_server/prompt.py)는 OpenAI 호환 메시지를 만든다. Ollama와 llama.cpp server에서 그대로 쓸 수 있다.
