# 검증 체크리스트

`docs/workflow.md` 5단계에서 **실제로 실행하고** 결과를 적는다.
"아마 될 것"은 통과가 아니다. 실패 시 2단계(구현)로 돌아간다.

## A. REA 연결

| # | 항목 | 확인 방법 | 통과 기준 |
| --- | --- | --- | --- |
| A1 | REA CLI 접근 | `npx -y rea-agents@latest --version` | 버전 문자열 출력 |
| A2 | Codex MCP 등록 | `npx -y rea-agents@latest doctor --client codex --json` | `scope_checks[registration:codex].ok === true` |
| A3 | 분석 스킬 설치 | 같은 출력 | `identity.skill.installed_version === expected_skill_version` |
| A4 | 웹 분석 경로 정상 | 같은 출력 | `healthy === true` |

## B. 분석 근거

| # | 항목 | 확인 방법 | 통과 기준 |
| --- | --- | --- | --- |
| B1 | 스크립트 원문 확보 | `docs/evidence/script-inventory.json` | 9개 항목, 각 `sha256` 존재 |
| B2 | 실행 관찰 근거 | `docs/evidence/coverage-summary.json` | 입력·컨트롤러·물리·루프 그룹 모두 실행 횟수 > 0 |
| B3 | 계측 원자료 | `docs/evidence/throttle-run.csv` | 헤더 + 샘플 ≥ 50행 |
| B4 | 화면 근거 | `docs/evidence/original-game.png` | 파일 존재, HUD·조작 안내가 읽힘 |
| B5 | 사실/추정 구분 | `docs/analysis/03-vehicle-controls.md` | `[사실]`·`[관찰]`·`[추정]`·`[미확인]` 태그가 모두 사용됨 |

## C. 데모 구현

| # | 항목 | 확인 방법 | 통과 기준 |
| --- | --- | --- | --- |
| C1 | 타입 검사 + 빌드 | `cd experiments/f1-recreation && npm run build` | 종료 코드 0, `dist/` 생성 |
| C2 | 개발/프리뷰 서버 기동 | `npm run preview` | 포트 4173 응답 |
| C3 | W 가속 | 브라우저에서 W 유지 | 속도 HUD가 0에서 증가 |
| C4 | S 브레이크 | 전진 중 S | 속도 감소 |
| C5 | S 후진 | 정지 상태에서 S | 속도 표시가 생기고 차량이 뒤로 이동 |
| C6 | A/D 조향 | 주행 중 A/D | 차량 요(yaw)가 변하고 카메라가 따라옴 |
| C7 | Space 핸드브레이크 | 주행 중 Space | 뒤 그립 저하로 거동 변화 |
| C8 | R 리셋 | R | 위치·속도 초기화 |
| C9 | 카메라 추적 | 주행 | 차량이 화면 중앙 부근 유지, FOV가 속도에 따라 변화 |
| C10 | 출처 구분 표기 | 소스 주석 | 모든 수식에 `[분석확인]` 또는 `[자체설계]` 표기 |

## D. 문서 · 저장소

| # | 항목 | 통과 기준 |
| --- | --- | --- |
| D1 | `docs/analysis/01~04` 존재 | 4개 파일 모두 작성 |
| D2 | `docs/comparison.md` 존재 | 측정값 기반 비교표 포함 |
| D3 | `docs/setup.md`, `docs/workflow.md`, `docs/errors.md`, `docs/checklist.md` | 모두 최신 |
| D4 | `README.md` | 소개·설치·실행·분석·결과·배운 점·향후 계획 포함 |
| D5 | 비밀값 미포함 | `.env`·토큰·키 파일 없음 |
| D6 | 대용량 파일 미포함 | 커밋 트리에 1 MB 초과 파일이 스크린샷 1개(≈816 KB) 외에 없음 |
| D7 | `.gitignore` 유효 | `node_modules/`, `dist/`, `.tmp/` 제외 확인 |

---

## 실행 결과

<!-- 라운드마다 아래 표를 갱신한다 -->

### 라운드 1–2 (2026-10-14) · REA 설치 + 원본 분석 + 데모 구현

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| A1 | ✅ | `rea 6.4.0` |
| A2 | ✅ | `scope_checks[registration:codex].ok = true` (`C:\Users\<user>\.codex\config.toml`) |
| A3 | ✅ | `installed_version 37 == expected 37` |
| A4 | ✅ | `healthy: true` (`environment_healthy: false`는 네이티브 공급자 미구성 — 범위 밖) |
| B1 | ✅ | `script-inventory.json` 9개, 전부 `sha256` 보유 |
| B2 | ✅ | input 10개 / controller 5개 / physics 18개 / loop 1개 / camera 9개 함수 모두 실행 횟수 > 0 |
| B3 | ✅ | `throttle-run.csv` 70샘플, `throttle-run-original-clean.csv` 70, `throttle-run-demo.csv` 70, `brake-runs.csv` 87 |
| B4 | ✅ | `original-game.png` 835,548 B · HUD·조작 안내·디버그 패널 판독 가능 |
| B5 | ✅ | `03-vehicle-controls.md`에 `[사실]`/`[관찰]`/`[추정]`/`[미확인]` 모두 사용 |
| C1 | ✅ | `tsc --noEmit` 오류 0 → `✓ built in 169ms`, `dist/assets/index-Cj9_Hwt8.js 552.29 kB` |
| C2 | ✅ | `node node_modules/vite/bin/vite.js preview --port 4173` → `http://localhost:4173/` (E-009, E-010 참조) |
| C3 | ✅ | W 유지: 0 → 100 km/h 2.34 s, 7.0 s에 257 km/h |
| C4 | ✅ | 187 km/h에서 S 유지 → 2.62 s 만에 정지 |
| C5 | ✅ | 정지 후 S 유지 시 후진 (HUD 음수 표시 확인) |
| C6 | ✅ | A: yawRate +0.47 rad/s, D: −0.50 rad/s, 고속 조향각 0.162 rad = `0.12 × 1.35` (분석 예측치와 일치) |
| C7 | ✅ | W+Space+D에서 급격한 속도 저하와 거동 변화 관찰 |
| C8 | ✅ | R → `pos (0, 0.35, 210)`, `yaw −1.5708`, `yawRate 0`, 속도 0 |
| C9 | ✅ | 스크린샷에서 차량 추적 확인 (`camera.ts` 전 상수 `[분석확인]` 표기) |
| C10 | ✅ | `src/` 기준 `[분석확인]` 124곳, `[자체설계]` 82곳 (scene.ts는 씬 구성이라 수식 주석 3곳) |
| D1 | ✅ | `docs/analysis/01~04` 4개 |
| D2 | ✅ | `docs/comparison.md` — 가속/제동/조향/지연 측정값 포함 |
| D3 | ✅ | setup·workflow·errors·checklist 모두 갱신 |
| D4 | ✅ | README 9개 섹션 |
| D5 | ✅ | `.env`·토큰·키 파일 없음 |
| D6 | ✅ | 커밋 대상 중 1 MB 초과 파일 **0건** (최대 `original-game.png` 816 KB) |
| D7 | ✅ | `git ls-files -o -c --exclude-standard` 37개 — `node_modules/`·`dist/`·`.tmp/` 전부 제외됨 |

### 라운드 3 (2026-10-14) · 미확인 항목 해소 + 데모 물리 보강

추가 항목(E 그룹)과 기존 항목 재실행 결과.

| 항목 | 내용 | 결과 | 근거 |
| --- | --- | --- | --- |
| E1 | MCP 서버 `initialize` | ✅ | `serverInfo { name: "rea", version: "6.4.0" }` |
| E2 | MCP `tools/list` | ✅ | **170개** (웹 계열 22종) |
| E3 | MCP `prompts/list` | ✅ | 6개 |
| E4 | MCP `tools/call` 실호출 | ✅ | `list_browser_targets` → `isError` 없음, `evidence_id: ev_8e8a06cf…` |
| E5 | 차종 튜닝 테이블 확정 | ✅ | 바디 프리셋 13종 + F1 차량 10종 (`03` 9절) |
| E6 | 조향 3종 수치 확정 | ✅ | F1 `0.50 / 0.07 / 70` |
| E7 | ERS 테이퍼 식 확정 | ✅ | `Rn(v)` 290→355 km/h 선형 |
| E8 | WASM 호출 경계 열거 | ✅ | Rapier API 27종 (`03` 10절) |
| E9 | 예측 대 실측 일치 | ✅ | 포화 조향각 예측 0.0945 rad vs 실측 **0.09450 rad** |
| C1 | 빌드 재실행 | ✅ | `tsc` 오류 0, `✓ built in 168ms`, `index-BvmjieOr.js 553.18 kB` |
| C3 | W 가속 | ✅ | 0→100 **2.55 s**, 0→300 **8.94 s**, 10.4 s에 314 km/h |
| C4 | S 제동 | ✅ | 187 km/h → 정지 **2.51 s** (R1 2.62 s에서 단축) |
| C5 | S 후진 | ✅ | 정지 후 음수 속도 표시 |
| C6 | A/D 조향 | ✅ | 82 m/s에서 `steerAngle` 0 → 0.0433 → 0.0840 → 0.09450 포화 |
| C8 | R 리셋 | ✅ | 위치·속도·요 초기화 |
| C10 | 출처 구분 표기 | ✅ | `[분석확인]` **208곳** / `[자체설계]` **58곳** (R1 124/82 → 분석확인 비중 60 % → 78 %) |
| D6 | 대용량 파일 | ✅ | 1 MB 초과 **0건** |
| D7 | 추적 파일 | ✅ | 41개 (`node_modules/`·`dist/`·`.tmp/` 제외) |

**주목할 변화**: `[자체설계]` 주석이 82 → 58로 줄고 `[분석확인]`이 124 → 208로 늘었다.
추측으로 채웠던 부분이 증거로 대체되었다는 뜻이다.

### 라운드 4 (2026-10-14) · 액티브 에어로 + 4륜 서스펜션

추가 항목(F 그룹)과 기존 C 항목 재실행 결과. 원자료: `docs/evidence/r4-throttle-demo.csv`, `r4-brake-demo.csv`

| 항목 | 내용 | 결과 | 근거 |
| --- | --- | --- | --- |
| F1 | 액티브 에어로 발동 조건 확정 | ✅ | `straightZone && brake < .05 && |steerAngle| < .03` (`03` 11절, `Game @ 4,541,495`) |
| F2 | 램프 상수 확정·검증 | ✅ | 열림 0.5 s / 닫힘 0.15 s — 제동 시 실측 닫힘 **0.153 s** |
| F3 | `aeroBalance` 확정 | ✅ | `activeAero ? 0.45 : 0.5 - cgZ/L` → F1 **0.45** (`index @ 38,825`) |
| F4 | 서스펜션 상수 확정 | ✅ | `44,800 N/m · 2,600 N·s/m · ARB 96,000/76,000 · rest 0.3` (`03` 12절) |
| F5 | 바퀴 하중 정합성 | ✅ | 정지 1789/1789/2135/2135 N (합 = mg), 346.8 km/h 합 22,059 N = `mg + 2.784×0.55×v²` |
| F6 | 수렴 속도 가설 검증 | ✅ | 329 → **346.8 km/h** (이론 348.5). 라운드 3의 설명이 수치로 확인됨 |
| F7 | 제동 격차 축소 | ✅ | 2.51 → **2.43 s** (원본 대비 +19.5 % → **+15.7 %**) |
| F8 | 동적 하중 관측 | ✅ | 제동 0.24 s에 앞하중 **10,273 N**(정적 3,578 N의 2.9배), pitch −0.0189 rad |
| F9 | 롤 하중이동 관측 | ✅ | 2.5 g 코너에서 앞 좌/우 **4,772 / 793 N**, roll −0.0105 rad |
| F10 | 바퀴 단위 휠 락 | ✅ | 제동 중 앞·뒤 모두 락, HUD `LOCK R` 표시 (`r4-brake-dive.png`) |
| C1 | 빌드 재실행 | ✅ | `tsc` 오류 0, `✓ built in 273ms`, `index-DlZuhBAH.js 556.88 kB` |
| C2 | 프리뷰 서버 | ✅ | `http://localhost:4173/` (E-010 동일 — IPv6 바인딩) |
| C3 | W 가속 | ✅ | 0→100 **2.60 s**, 0→200 4.99, 0→250 6.33, 0→300 **8.27 s**, 0→330 10.76 |
| C4 | S 제동 | ✅ | 186 km/h → 정지 **2.43 s** |
| C5 | S 후진 | ✅ | 정지 상태 S 3초 → **−35.0 km/h** |
| C6 | A/D 조향 | ✅ | 82 m/s에서 포화 **0.09450 rad**, 150 km/h 선회 yawRate −0.7 rad/s 수렴 |
| C7 | Space 핸드브레이크 | ✅ | 120 → 25.8 km/h, yawRate −0.961 rad/s, 뒤 하중 2300/1993 N |
| C8 | R 리셋 | ✅ | `pos (0, 0.36, 320)`, `yaw −1.5708`, 속도 0, heave 0, 하중 정적값 복귀 |
| C9 | 카메라 추적 | ✅ | `r4-brake-dive.png`, `r4-corner-roll.png` — 차량 추적·FOV 변화 확인 |
| C10 | 출처 구분 표기 | ✅ | `src/` 기준 `[분석확인]` **254곳** / `[자체설계]` **68곳** (R3 208/58 → 분석확인 비중 78 % → **79 %**) |

**주목할 변화**: 라운드 3에서 **[미확인]** 으로 남겼던 액티브 에어로 발동 조건이 번들 재독으로
해소되면서, "구현 못 함"이 아니라 "구현 후 가설 검증"으로 넘어갔다.
수렴 속도(329 → 346.8 km/h)와 제동 격차(19.5 → 15.7 %) 모두 예측한 방향으로 움직였다.

### 라운드 5 (2026-10-14) · 브레이크 보조 + 바퀴별 힘 해석 전체

| 항목 | 내용 | 결과 | 근거 |
| --- | --- | --- | --- |
| G1 | 바퀴 힘 해석 블록 전문 확보 | ✅ | `Game @ 4,536,353–4,537,100` (`03` 13절) |
| G2 | 어시스트 기본값 확인 | ✅ | `brakeAssist = !0`, `brakeGrip 1.2`, `brakeForceScale 1.5` (`@ 4,531,570`) |
| G3 | 보조 배분식 확인 | ✅ | `v = clamp(앞하중/전체하중, 0.45, 0.75)` |
| G4 | 추정값 4건 교체 | ✅ | 락 횡력 0.35→**0.25**, 핸드브레이크 `mass·G·1.5`→**mass×6**, 마찰원→**마찰타원**, μ의 grip 항→**mechGrip 0.985** |
| G5 | B 키 토글 구현 | ✅ | HUD에 `ABS` 표시, 토글 시 사라짐 (`r5-brake-assist.png`) |
| G6 | 보조 ON 제동 | ✅ | 186→0 **1.94 s**, 락 없음 (원본 2.10 s 대비 −7.6 %) |
| G7 | 보조 OFF 제동 | ✅ | 186→0 **2.35 s**, 앞·뒤 락 발생 |
| G8 | 횡속도 소거 상한(E) 구현 | ✅ | `E = |바퀴 좌표계 횡속도| · (mass/2) · grip / dt` |
| C1 | 빌드 | ✅ | `tsc` 오류 0, `index-B0_8E5zY.js 557.59 kB` |
| C3 | W 가속 | ✅ | 0→100 **2.50 s**, 0→200 4.89, 0→300 8.23, 48 s에 346.8 km/h |
| C5 | S 후진 | ✅ | −35.1 km/h |
| C6 | A/D 조향 | ✅ | 포화 **0.09450 rad**, 요레이트 피크 0.886 rad/s, 150 km/h 선회 −0.753 rad/s 수렴 |
| C7 | Space 핸드브레이크 | ✅ | 120.6 → **31.6 km/h**, yawRate −2.13 rad/s (확정 `handbrakeForce` 적용 후) |
| C8 | R 리셋 | ✅ | 속도 0, heave 0, 하중 정적값, `brakeAssist` 기본 ON 유지 |
| C10 | 출처 구분 표기 | ✅ | `src/` 기준 `[분석확인]` **292곳** / `[자체설계]` **53곳** |
