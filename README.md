# REA Playground

[REA(Reverse Engineer Anything)](https://rea.tools/)를 실제로 사용해 **이미 배포된 프로그램의
동작 원리를 증거 기반으로 분석**하고, 그 원리를 바탕으로 기능을 **직접 다시 구현**하는 실험 저장소.

> 핵심 원칙: 코드를 베끼지 않는다. 관찰한 사실 · 코드에서 확인한 사실 · 추정을 반드시 구분한다.
> 검증하지 않은 것을 성공했다고 적지 않는다.

---

## 왜 REA인가

일반적인 코드 검색은 "비슷해 보이는 코드"를 찾아 준다.
REA는 **실행 중인 프로그램과 배포된 산출물 자체**에서 근거를 수집한다:
스크립트 원문을 SHA-256과 함께 보존하고, V8 실행 카운터를 리셋해 어떤 함수가 실제로
돌았는지 기록하고, 결과마다 "무엇을 확인하지 못했는지"를 `limitations`로 남긴다.

이 저장소는 그 차이를 실제 프로젝트로 증명하기 위한 공간이다.

## 저장소 구조

```
rea-playground/
├── README.md
├── .gitignore
├── docs/
│   ├── setup.md              설치·환경 구성 (실행한 명령과 결과)
│   ├── workflow.md           모든 구현 작업이 따르는 6단계 워크플로
│   ├── errors.md             오류 모음 — 작업 시작 전 필독
│   ├── checklist.md          검증 체크리스트
│   ├── comparison.md         원본 vs 재구현 비교
│   ├── analysis/
│   │   ├── 01-overview.md    분석 대상·목적·도구·환경
│   │   ├── 02-architecture.md 시스템 구조·모듈 관계·실행 흐름
│   │   ├── 03-vehicle-controls.md 가속·브레이크·조향 상세 분석
│   │   └── 04-evidence.md    분석 근거·재현 방법·한계
│   └── evidence/             커밋 가능한 Evidence(요약본·해시·스크린샷·계측 CSV)
├── experiments/
│   └── f1-recreation/        분석 결과 기반 재구현 데모 (Vite + TS + three.js)
└── scripts/
    ├── capture-and-analyze.mjs  REA 분석 파이프라인 재현
    └── measure-throttle.mjs     가속 계측 (REA 아님 — 자체 계측)
```

## 설치

```powershell
# 1) Node.js 22.19+ / 24.11+ / 26+ 필요
node -v

# 2) REA를 코딩 에이전트(Codex)에 연결 — 계획을 먼저 보고 승인
npx -y rea-agents@latest setup --client codex --dry-run
npx -y rea-agents@latest setup --client codex

# 3) 연결 검증
npx -y rea-agents@latest doctor --client codex --json
```

자세한 내용과 실제 출력은 [`docs/setup.md`](docs/setup.md).

## 실행

```powershell
# 데모 실행
cd experiments/f1-recreation
npm install
npm run dev        # 개발 서버
npm run build      # 타입 검사 + 빌드
npm run preview    # 빌드 결과 미리보기 (포트 4173)
```

```powershell
# 분석 재현 (임시 프로필 Chrome이 127.0.0.1:9222 에 떠 있어야 함)
node scripts/capture-and-analyze.mjs
node scripts/measure-throttle.mjs
```

---

## 실험 #1 — 배포된 F1 레이싱 게임

**대상**: <https://jngbnss.github.io/f1/> (사용자 본인이 제작·배포, 분석 권한 보유)
**범위**: 공개 배포된 산출물과 실행 동작만. 원본 리포지토리 소스는 사용하지 않음.

### 분석 과정

| 단계 | 사용한 REA 명령 | 얻은 것 |
| --- | --- | --- |
| 1 | `doctor --client codex` | Codex–REA 연결 검증 (`healthy: true`) |
| 2 | `list-browser-targets` | 루프백 CDP에서 대상 페이지 식별 |
| 3 | `inspect-web-page --include-script-sources` | 스크립트 9개 원문 + SHA-256 보존 |
| 4 | `export-web-scripts` | 검증된 파일로 추출 |
| 5 | `analyze-javascript-application` | 정적 애플리케이션 그래프(모듈·import·export) |
| 6 | `observe-web-execution` | W 키를 누른 9초 동안의 함수별 실행 횟수 |
| 7 | `inspect-web-event-listeners` | 캔버스에는 입력 리스너가 없음을 확인 |
| 8 | `capture-web-screenshot` | 화면 Evidence (HUD·조작 안내 확인) |

### 핵심 분석 결과 (요약)

- **구조**: three.js r186 렌더링 + Rapier WASM 물리. 진입 HTML은 1.1 KB뿐이고 UI는 전부 JS 생성.
  서킷별 코드 분할(동적 import)로 레이스 시작 시 모듈 7개가 추가 로드된다.
- **루프**: 고정 타임스텝 **1/60초**, 최대 5 서브스텝, 프레임 상한 250 ms.
  남은 시간 비율(alpha)로 `lerp`/`slerp` 보간 렌더.
- **입력**: 리스너는 캔버스가 아니라 **`window`** 에 붙는다. W/S/A/D는 **디지털 0·1** 입력.
  여러 입력원은 `max`로 합성된다.
- **가속**: 구동력 = `min(engineForce, availablePower / v)` × 최고속 리미터 × 발진 완화 보정.
  `engineForce = mass × 9.81 × 1.4` → 발진 가속도 상한 1.4 g.
- **W·S의 역할은 진행 방향에 따라 바뀐다.** 전진 중 S는 브레이크, 정지 상태의 S는 후진.
- **조향**: 즉시 꺾이지 않고 슬루율 제한(꺾기 6.46/s, 복귀 8.12/s). 속도가 오를수록 최대 조향각이
  `n(2−n)` 곡선으로 감소. 타이어 횡력은 **Pacejka 매직 포뮬러 (B=36, C=1.2, E=0.3)**.
- **카메라**: 차량에 고정되지 않고 지수 감쇠(`1 − e^(−k·dt)`)로 요를 추적. 속도에 따라 FOV 62°→70°.
- **계측**: 트랙 위 클린 런 기준 0→100 km/h **2.78초**, 0→200 km/h **5.22초**, 7초에 256 km/h.

상세: [`docs/analysis/`](docs/analysis/) · 근거와 한계: [`docs/analysis/04-evidence.md`](docs/analysis/04-evidence.md)

### 데모 결과

[`experiments/f1-recreation/`](experiments/f1-recreation/) — Vite + TypeScript + three.js.
Rapier를 쓰지 않고 **자전거 모델 + 위 매직 포뮬러 곡선**으로 근사했다.
분석에서 확인된 수식(루프·입력·명령 변환·구동력·카메라·HUD)은 그대로 재현하고,
확인하지 못한 값은 자체 설계값으로 채운 뒤 코드 주석에 `[분석확인]` / `[자체설계]`로 구분했다.

원본과의 비교: [`docs/comparison.md`](docs/comparison.md)

| 측정 항목 | 원본 | 데모 (R1) | 데모 (R3) |
| --- | ---: | ---: | ---: |
| 0 → 100 km/h | 2.83 s | 2.34 s | **2.55 s** |
| 0 → 200 km/h | 5.33 s | 4.98 s | **4.96 s** |
| 0 → 250 km/h | 6.74 s | 6.71 s | **6.43 s** |
| 186 km/h → 정지 | **2.10 s** | 2.62 s (+24.8 %) | **2.51 s (+19.5 %)** |
| 고속 포화 조향각 | **[미확인]** (HUD 미노출) | 0.162 rad | **0.09450 rad = `0.07 × 1.35`** |
| `keydown` → 속도 > 0 | 27–29 ms | 28–29 ms | — |

**R3(라운드 3)** 에서 1라운드에 **[미확인]** 이던 차종 튜닝 수치를 번들에서 전부 확정해
자체 설계값을 실제 값으로 교체하고, 제동 격차의 원인으로 지목했던 **종방향 하중 이동**을 구현했다.

- 조향: 분석식으로 예측한 `0.07 × 1.35 = 0.0945 rad`과 데모 실측 `0.09450 rad`이 **완전 일치**
- 제동: 가설대로 격차가 **24.8 % → 19.5 %** 로 줄었다. 방향은 맞았지만 단일 원인은 아니었다
  (남은 후보: 바퀴 4개 vs 축 2개, 서스펜션 동적 하중, 액티브 에어로 미구현)
- `availablePower`를 상수로 본 1라운드 가정은 **오류**였다 — ERS가 290→355 km/h 구간에서 선형 테이퍼된다

---

## 작업 방식

모든 구현 작업은 [`docs/workflow.md`](docs/workflow.md)의 6단계를 따른다.

```
1. 오류모음 확인 → 2. 구현 진행 → 3. 스모크 테스트 → 4. 오류 추가
→ 5. 검증·체크리스트 → 6. 정리 → 커밋 → 푸시
```

## 기술적으로 배운 점

1. **소스맵 없는 번들도 충분히 분석 가능하다.** 식별자는 잃어버려도 **상수와 수식의 형태**는
   남는다. `1.07 + 0.09 * max(0, 1 - v/(maxSpeed*0.3))` 같은 식은 이름 없이도 의도가 읽힌다.
2. **정적 분석과 동적 관찰은 서로를 검증한다.** 정적으로 찾은 `onKeyDown`이 실행 관찰에서
   정확히 1회 기록된 것이, 그 함수가 "실제로 쓰이는 경로"임을 증명한다.
3. **도구의 한계를 기록하는 것이 결과만큼 중요하다.** REA가 반환하는 `limitations`를 그대로
   옮겨 적으면, 나중에 "이 수치를 어디까지 믿어도 되는가"를 다시 판단할 수 있다.
   예: 정밀 커버리지는 V8 최적화를 끄므로 **성능 측정에 쓰면 안 된다**.
4. **게임 느낌은 물리보다 "입력 필터"에서 나온다.** 브레이크 압력 램프(10/16), 조향 슬루율,
   속도별 조향각 페이드, 카메라 지수 감쇠 — 모두 물리 엔진 밖의 1차 필터다.
5. **플랫폼 제약은 미리 드러난다.** `recover-javascript-sources`가 Linux 전용이라는 사실을
   초반에 확인했기에 우회 경로(번들 직독)를 일찍 택할 수 있었다.
6. **데이터 테이블의 값은 "입력"이지 "결과"가 아니다.** 차량표의 최고속 348 km/h를 그대로
   쓰려 했지만, 그 값을 읽는 설정 빌더가 특성 보정을 반영해 **40회 이분탐색으로 다시 풀어
   352 km/h로 덮어쓰고** 있었다. 테이블만 읽고 멈췄다면 틀린 수치로 재구현했을 것이다.
7. **"상수일 것"이라는 가정은 검증해야 한다.** 1라운드에 `availablePower`를 고정값으로 봤는데,
   실제로는 290→355 km/h 구간에서 MGU-K 기여가 선형으로 사라지는 **ERS 테이퍼**였다.
8. **가설은 수치로 검증하면 "부분 정답"이 자주 나온다.** "제동 25 % 차이는 하중 이동 부재"라는
   가설을 구현으로 검증하니 격차가 19.5 %까지만 줄었다. 방향은 맞았지만 단일 원인은 아니었고,
   그 사실 자체가 다음 가설(바퀴 4개 vs 축 2개)의 출발점이 된다.
9. **MCP는 클라이언트 없이도 검증할 수 있다.** 등록된 것과 같은 커맨드로 stdio 서버를 직접 띄워
   `initialize → tools/list → tools/call`을 돌리면 재시작을 기다리지 않고 표면을 확인할 수 있다.
   단, **인자 이름은 CLI와 다르다**(`endpoint` ✗ / `cdp_endpoint` ✓).

## 향후 개선 방향

- [x] **MCP 경로 검증** — stdio JSON-RPC로 `initialize`/`tools/list`(170개)/`tools/call` 성공
      (`docs/evidence/mcp-verification.json`). 남은 것: **Codex 세션 내부**에서의 호출
- [x] **원본의 차종 튜닝 테이블 수치 확정** — 13개 바디 프리셋 + F1 10개 차량 전부
      (`docs/analysis/03-vehicle-controls.md` 9절)
- [x] **WASM(Rapier) 호출 경계 열거** — API 27종과 호출 횟수 (`03` 10절). WASM *내부*는 여전히 미분석
- [x] **데모에 종방향 하중 이동 + 휠 락 적용** — 제동 격차 24.8 % → 19.5 %
- [ ] 데모에 **바퀴 4개 레이캐스트 서스펜션** 모델 추가 → 남은 제동 격차 19.5 %의 원인 검증
- [ ] 액티브 에어로(`drag 0.7 / downforce 0.55` 보간) 구현
- [ ] `compare-web-captures` / `compare-application-versions`로 재배포 전후 차이 추적
- [ ] 원본의 0→300 km/h 측정 — Melbourne 직선이 짧아 **[미측정]**. 직선이 긴 서킷으로 재시도
- [ ] 실험 #2: Electron 데스크톱 앱 (`analyze-javascript-application` + `inspect-electron-page`)

## 라이선스 · 윤리

- 분석 대상은 **저장소 소유자 본인이 제작·배포한 게임**이다.
- 공개 배포된 산출물과 실행 동작만 관찰했고, 원본 소스코드는 사용하지 않았다.
- REA는 공식 배포본(`rea-agents` npm 패키지)을 그 라이선스에 따라 사용했다.
- 재배포 권한이 없는 외부 에셋(3D 모델·폰트·오디오·트랙 데이터)은 이 저장소에 포함하지 않는다.
