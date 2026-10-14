# JOSEON OUTLAW — 사전 준비 산출물

[`docs/joseon-outlaw-plan.md`](../../docs/joseon-outlaw-plan.md) 12절 "지금부터 할 일"의 결과물이다. 팀이 필요한 1번(팀원 경험 조사)과 8번(시연 PC 사양)을 뺀 나머지 항목을 초안으로 만들고, 기계로 검사할 수 있는 것은 데이터와 테스트로 만들었다.

**모두 초안이다.** 스타일, 에셋, 모델처럼 결정이 필요한 항목은 후보와 권장안을 제시했을 뿐이고, 확정은 팀이 1주차에 한다.

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

Python 3.11 이상, 외부 패키지 없음.

```bash
cd projects/joseon-outlaw
python run_smoke.py                 # 전체 스모크 테스트 + 각 검사 도구
python -m tools.fsm                 # 상태 기계 검사
python -m tools.ledger              # 라이선스 대장 검사
python -m tools.llm_bench --mock    # LLM 벤치마크 파이프라인 점검
```

## 11. AI 계약 요약

- 요청 [`schemas/dialogue_request.schema.json`](schemas/dialogue_request.schema.json): NPC, 퀘스트 상태, 최근 6턴, 읽기 전용 월드 사실
- 응답 [`schemas/dialogue_response.schema.json`](schemas/dialogue_response.schema.json): `text`(90자, 줄바꿈 금지), `emotion`, `intent`만 있다. **상태를 바꾸는 필드는 없다**(`additionalProperties: false`).
- [`data/dialogue_policy.json`](data/dialogue_policy.json): NPC·상태별 허용 intent, 고정 대사, 선택지. 퀘스트를 움직이는 것은 `game_event`가 붙은 선택지뿐이다.
- [`ai_server/validator.py`](ai_server/validator.py) `finalize()`는 어떤 입력에도 스키마를 만족하는 응답을 돌려준다. 타임아웃, JSON 깨짐, 허용되지 않은 intent, 금칙어, 영어 섞임, 낱말 반복이면 고정 대사로 대체한다.
- [`ai_server/prompt.py`](ai_server/prompt.py)는 OpenAI 호환 메시지를 만든다. Ollama와 llama.cpp server에서 그대로 쓸 수 있다.

## 1주차로 넘기는 것

- 팀원 조사(12절 1번)와 시연 PC 사양(8번)
- 스타일, 에셋 팩, 모델의 최종 선택
- Godot 4.7.2에 플러그인을 실제로 설치하고 확인 (09번 4절)
- 사람 평가 2인 (10번 4절)
