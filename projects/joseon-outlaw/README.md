# JOSEON OUTLAW — 사전 준비 산출물

[`docs/joseon-outlaw-plan.md`](../../docs/joseon-outlaw-plan.md) 12절 "지금부터 할 일"의 결과물이다. 조사·문서·데이터가 있지만 실제 채택과 구현은 1주차 검증 뒤 확정한다.

상태는 `초안 → 실제 검증 → 확정` 순서다. 현재 라이선스 대장은 **승인 0건, 후보 38건, 제외 10건**이므로 외부 에셋은 아직 사용 확정 상태가 아니다.

## 자동 검사와 미리보기

- [GitHub Actions](https://github.com/jngbnss/rea-playground/actions/workflows/joseon-outlaw.yml): PR과 `main` 변경 시 스모크 테스트 실행
- [UI 목업](https://jngbnss.github.io/rea-playground/): `main` 검사 통과 후 GitHub Pages에 배포

## 다음 작업

1. 팀원 경험과 시연 PC 사양을 기록한다.
2. Godot 4.7.2 우선 후보로 Windows 내보내기를 검증하고, 실패하면 4.6.3을 시험한다.
3. 3인칭 이동·카메라와 회색박스 마을·산길을 구현한다.
4. 고정 대사 기반 NPC 상호작용과 장부 회수 퀘스트를 연결한다.
5. 검 전투와 적 FSM을 붙여 AI 없이 처음부터 끝까지 완주한다.
6. FastAPI와 로컬 LLM을 연결하고 실패 시 고정 대사 fallback을 검증한다.

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
python run_smoke.py                 # 데이터·계약·도구 검사
python -m tools.godot_smoke --phase 1
python -m tools.export_windows      # Windows 내보내기 후 실행 파일 기동
```

에디터에서는 `game/project.godot`을 연다. 명령행 실행은 `godot --path game`이다. 기준 PC와 도구 버전은 [`docs/environment.md`](docs/environment.md), 단계별 완료 기준은 [`docs/implementation-checklist.md`](docs/implementation-checklist.md), 구현 중 오류는 [`docs/implementation-errors.md`](docs/implementation-errors.md)에 기록한다.

## 11. AI 계약 요약

- 요청 [`schemas/dialogue_request.schema.json`](schemas/dialogue_request.schema.json): NPC, 퀘스트 상태, 최근 6턴, 읽기 전용 월드 사실
- 응답 [`schemas/dialogue_response.schema.json`](schemas/dialogue_response.schema.json): `text`(90자, 줄바꿈 금지), `emotion`, `intent`만 있다. **상태를 바꾸는 필드는 없다**(`additionalProperties: false`).
- [`data/dialogue_policy.json`](data/dialogue_policy.json): NPC·상태별 허용 intent, 고정 대사, 선택지. 퀘스트를 움직이는 것은 `game_event`가 붙은 선택지뿐이다.
- [`ai_server/validator.py`](ai_server/validator.py) `finalize()`는 어떤 입력에도 스키마를 만족하는 응답을 돌려준다. 타임아웃, JSON 깨짐, 허용되지 않은 intent, 금칙어, 영어 섞임, 낱말 반복이면 고정 대사로 대체한다.
- [`ai_server/prompt.py`](ai_server/prompt.py)는 OpenAI 호환 메시지를 만든다. Ollama와 llama.cpp server에서 그대로 쓸 수 있다.

## 1주차로 넘기는 것

- 팀원 조사(12절 1번)와 시연 PC 사양(8번)
- 스타일, 에셋 팩, 모델의 최종 선택
- 기본 노드로 수직 슬라이스를 만든 뒤 필요한 플러그인만 실제 설치·내보내기로 검증 (09번 4절)
- 사람 평가 2인 (10번 4절)
