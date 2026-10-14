# 04 · 분석 근거와 재현 방법

이 문서는 "그래서 그걸 어떻게 알았는가"에만 답한다.

---

## 1. REA 연결 상태 (근거)

```powershell
npx -y rea-agents@latest doctor --client codex --json
```

핵심 필드:

```json
{
  "healthy": true,
  "environment_healthy": false,
  "scope_checks": [
    { "name": "node", "ok": true, "detail": "24.18.0" },
    { "name": "registration:codex", "ok": true, "detail": "C:\\Users\\<user>\\.codex\\config.toml" }
  ],
  "identity": {
    "cli_package_version": "6.4.0",
    "expected_skill_version": "37",
    "catalog": { "counts": { "cli_commands": 127, "mcp_tools": 170, "mcp_prompts": 6 } }
  }
}
```

- `healthy: true` → **Codex–REA 연결 정상**
- `environment_healthy: false` → Ghidra/IDA/Hopper 미구성. 웹 분석과 무관(의도적 제외)
- 전체 파일: `docs/evidence/doctor-codex.json` (sha256 `00375ccf…628b`)

`.codex/config.toml`에 실제로 기록된 등록:

```toml
[mcp_servers.rea]
command = "C:\\Program Files\\nodejs\\node.exe"
args = [ "…\\rea-agents\\scripts\\rea.mjs", "mcp" ]
startup_timeout_sec = 30
```

> **1라운드**: 분석은 전부 **REA CLI**로 수행했다. MCP 경로는 등록·검증만 마쳤고,
> Codex 세션 재시작이 필요해 분석 근거로 쓰지 않았다.
>
> **2라운드**: Codex 재시작을 기다리지 않고 **MCP 서버 자체를 직접 검증**했다(아래 1-2절).

### 1-2. MCP 경로 실제 검증 (2라운드)

`.codex/config.toml`에 등록된 것과 **동일한 커맨드**로 REA를 stdio MCP 서버로 띄우고,
JSON-RPC 2.0으로 직접 대화했다. 즉 "Codex가 하게 될 일"을 그대로 재현한 것이다.

```
node <npx cache>/rea-agents/scripts/rea.mjs mcp
```

| 단계 | 요청 | 응답 |
| --- | --- | --- |
| 1 | `initialize` (protocol `2024-11-05`) | `serverInfo: { name: "rea", version: "6.4.0" }` |
| 2 | — | `capabilities: { tools: {listChanged}, prompts: {listChanged}, completions: {} }` |
| 3 | `notifications/initialized` | — |
| 4 | `tools/list` | **170개** |
| 5 | `prompts/list` | 6개: `investigate_feature`, `compare_application_versions`, `verify_reconstruction`, `trace_crash`, `audit_residual_unknowns`, `prepare_bounded_process_capture` |
| 6 | `tools/call` `list_browser_targets` | `isError: false`, Evidence 반환 |

6번의 실제 반환값(요약):

```json
{
  "evidence_id": "ev_8e8a06cf…9ce1",
  "provider": { "id": "rea-cdp-browser", "version": "2" },
  "predicate_type": "rea.browser-target-list",
  "normalized_result": { "browser": { "product": "Chrome/155.0.8059.41" }, "targets": [ … ] }
}
```

→ **MCP 표면이 실제로 동작하며, CLI와 동일한 Evidence 구조를 돌려준다**는 것을 확인했다.
전체 기록: `docs/evidence/mcp-verification.json`

주의: MCP 도구의 인자 이름은 **CLI 위치 인자명이 아니라 스키마 키**다.
`endpoint`로 보내면 `Input validation error`가 난다 → 올바른 키는 `cdp_endpoint` (`errors.md` E-015).

웹 분석 계열 MCP 도구 22종이 노출된다:
`inspect_web_page`, `observe_web_execution`, `export_web_scripts`, `analyze_javascript_application`,
`analyze_web_bundle`, `trace_javascript_semantics`, `capture_browser_scenario`,
`compare_web_captures`, `capture_web_screenshot` 등.

> 여전히 하지 않은 것: **Codex 세션 안에서** REA 도구를 호출하는 것.
> 그건 Codex 재시작 이후에만 가능하며, 했다고 주장하지 않는다.

---

## 2. 정적 근거 — 코드에서 직접 확인한 것

### 2-1. 스크립트 원문 확보

```powershell
npx -y rea-agents@latest inspect-web-page http://127.0.0.1:9222 <TARGET_ID> `
  --observation-ms 4000 --include-script-sources --include-accessibility-text `
  --include-console-text --json > inspect-web-page.json
```

- 결과: 9개 스크립트, 각각 **SHA-256과 바이트 수가 기록된 원문**이 함께 보존됨.
- `resource_reconciliation.status = "exact"` → 네트워크 리소스와 V8이 파싱한 스크립트가 일치.
- 목록·해시: `docs/evidence/script-inventory.json`

### 2-2. 검증된 파일로 추출

```powershell
npx -y rea-agents@latest export-web-scripts <capture.json> C:/rea-playground/.tmp/f1-scripts
```

추출된 파일 해시(앞 16자리):

| 파일 | sha256 (앞 16) | bytes |
| --- | --- | ---: |
| `Game-CGRrnhwj.js` | `1de699278cf8f8da` | 4,787,386 |
| `index-CZ5aQSby.js` | `01f6873977d93ea5` | 509,385 |
| `three.module-mgjLJR3U.js` | `750d832bcbecdaba` | 352,360 |
| `three.core-ChCFGFa7.js` | `6c5321b79572d050` | 263,214 |
| `Monaco_landmarks-CVcCt41_.js` | `1184c9db25b5db1a` | 18,598 |
| `cars-3LgIUEBS.js` | `b735531877200c71` | 8,975 |
| `Monza_landmarks-BvqtwGKc.js` | `e48deed9d08beb43` | 6,354 |
| `RaceManager-Cv7zsmMd.js` | `6968e250e2780bbe` | 1,630 |
| `rolldown-runtime-hePW80VL.js` | `580ad8c58061a4dd` | 716 |

03 문서에 적힌 모든 **오프셋은 위 해시의 파일 기준**이다. 파일이 바뀌면 오프셋도 바뀐다.

### 2-3. 애플리케이션 그래프

```powershell
npx -y rea-agents@latest analyze-javascript-application C:/rea-playground/.tmp/f1-scripts --json
```

- 결과 54.2 MB (sha256 `2c1db151…31a92`). `JavaScriptApplicationGraph` + `semantic_graph`.
- 확인된 것: 모듈 간 import/export 바인딩, `dynamic-import:assets/*.js` 노드
  (상태 `unresolved` = 정적으로는 대상 특정 불가).
- 한계로 기록된 것: `three.core-*.js`의 시맨틱 그래프는 **결과 예산 초과로 잘렸다**
  (REA가 `limitations`에 명시). 이번 분석에서 three.js 내부는 필요하지 않았다.

---

## 3. 동적 근거 — 실행 중 관찰한 것

### 3-1. 정밀 실행 관찰

```powershell
npx -y rea-agents@latest observe-web-execution http://127.0.0.1:9222 <TARGET_ID> `
  --observation-ms 9000 --json
```

관찰 창: `armed_at 2026-10-14T07:43:56.229Z` → `ended_at 07:44:05.232Z`, 종료 사유 `window_elapsed`.
이 9초 동안 **W 키를 누른 상태로 유지**했다.

`Game-CGRrnhwj.js`에서 관찰된 실행 횟수(요약: `docs/evidence/coverage-summary.json`):

| 함수 (오프셋) | 역할 | 실행 횟수 |
| --- | --- | ---: |
| `onKeyDown` @11,114 | 키 다운 핸들러 | **1** |
| `read` @10,719 | KeyboardSource.read | 219 |
| `poll` @9,823 | InputHub.poll | 174 |
| `update` @4,529,964 | VehicleController.update | 1,113 |
| `maxSteer` @4,530,663 | 속도별 최대 조향각 | 39 |
| `yc` @4,531,116 | 매직 포뮬러 | 60 |
| `step` @4,533,253 | VehiclePhysics.step | 1,018 |
| `fixedUpdate` @4,540,647 | Vehicle.fixedUpdate | 260 |
| `getPose` @4,538,914 | Rapier 포즈 읽기 | 406 |
| `get speedKmh` @4,540,522 | HUD 속도 | 138 |
| `tick` @4,735,790 | 고정 스텝 루프 | 21 |

**이 표에서 결론으로 삼은 것 / 삼지 않은 것**

- 결론으로 삼은 것: 03 문서에서 정적으로 읽어낸 함수들이 **전부 실제로 실행된다**는 사실.
  특히 `onKeyDown`이 정확히 1회 — 내가 보낸 `rawKeyDown` 이벤트 1건과 일치한다.
- 결론으로 삼지 **않은** 것: 함수 간 호출 비율. REA가 명시한 한계대로
  *"V8은 중첩된 함수/블록 범위와 횟수를 보고할 뿐 시간순 트레이스가 아니며,
  겹치는 범위의 횟수를 합산해서는 안 된다"*.
  또한 정밀 커버리지는 **V8 최적화를 끄기 때문에** 관찰 중 프레임레이트가 크게 떨어진다
  (`tick` 21회/9초). 따라서 **이 관찰로 FPS나 시간 성능을 논하지 않는다.**

### 3-2. 리스너 위치 조사

```powershell
npx -y rea-agents@latest inspect-web-event-listeners http://127.0.0.1:9222 <TARGET_ID> "canvas" --json
npx -y rea-agents@latest inspect-web-event-listeners http://127.0.0.1:9222 <TARGET_ID> "body"   --json
```

| 선택자 | 등록된 리스너 |
| --- | --- |
| `canvas` | `webglcontextlost` ×2, `webglcontextrestored`, `webglcontextcreationerror` |
| `body` | 없음 |

→ **키 입력 리스너가 DOM 요소에 없다**는 사실을 확인했고, 이는 정적 분석에서 읽은
`addEventListener("keydown", …)`의 대상이 `window`라는 점과 일치한다.
(REA의 이 도구는 `window` 자체를 선택자로 지정할 수 없다 → 간접 확인.)

### 3-3. 스크린샷

```powershell
npx -y rea-agents@latest capture-web-screenshot http://127.0.0.1:9222 <TARGET_ID> --json
```

- 929×1037, PNG 835,548 bytes, sha256 `99343cc3366a86f4…`
- 파일: `docs/evidence/original-game.png`
- 이 스크린샷에서 직접 읽히는 사실:
  - 화면 하단 조작 안내: `W/↑ 가속 · S/↓ 브레이크/후진 · A/D 조향 · Space 핸드브레이크 ·
    B 브레이크 보조 · R 리셋 · O 오버테이크 모드 · L 레이싱 라인 · C 시점 · G 손 조작 ·
    M 소리 · H HUD · Esc 메뉴` → **03 문서의 키 매핑과 정확히 일치**
  - 우하단 속도계 + `km/h` 단위, 기어 표시 `N`
  - 좌상단 디버그 패널: `FPS 30`, `physics 4.55 ms (1.9×)`, `resolution 0.50×`,
    `draw calls 627`, `input keyboard`
  - 화면 중앙 복귀 안내 `R 키를 눌러 트랙으로 복귀` → 측정 중 코스를 이탈했음을 입증
  - URL: `?car=f1-ferrari&track=melbourne&ai=19&laps=3`

### 3-4. 가속 계측 **[REA 아님 — 자체 계측]**

REA에는 "키를 누른 채 유지"하는 도구가 없다(`capture-browser-scenario`의 `press`는
누름–뗌 1회). 그래서 CDP `Input.dispatchKeyEvent`로 `rawKeyDown`만 보내 상태를 유지하고
HUD 텍스트를 100 ms 간격으로 읽었다.

- 스크립트: `scripts/measure-throttle.mjs`
- 결과: `docs/evidence/throttle-run.csv` (70행, `ms,kmh,active_input_source`)
- 이 수치는 **REA 분석 결과가 아니라 자체 계측값**이다.

---

## 4. 재현 방법 (처음부터 끝까지)

```powershell
# 0) 저장소 루트에서
cd C:\rea-playground

# 1) REA 상태 확인
npx -y rea-agents@latest doctor --client codex --json

# 2) 임시 프로필 브라우저 기동 (루프백 전용)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 `
  --user-data-dir=.tmp/chrome-rea-profile --no-first-run --no-default-browser-check `
  --disable-extensions "https://jngbnss.github.io/f1/"

# 3) 캡처 → 추출 → 정적 분석 (대상 target id는 2-1 단계 출력에서 확인)
node scripts/capture-and-analyze.mjs

# 4) 게임을 직접 시작한 뒤(메뉴 '출발 ▶') 가속 계측
node scripts/measure-throttle.mjs
```

재현 시 **번들 해시가 바뀌어 있으면** 게임이 재배포된 것이다.
그 경우 03 문서의 오프셋은 더 이상 맞지 않으며, `docs/evidence/script-inventory.json`의
해시와 비교해 차이를 먼저 확인해야 한다.

---

## 5. Evidence 파일 목록

커밋한 것:

| 파일 | 내용 |
| --- | --- |
| `doctor-codex.json` | REA 연결 검증 전체 출력 |
| `script-inventory.json` | 9개 스크립트 URL·바이트·해시·소스맵 유무 |
| `coverage-summary.json` | 정밀 실행 관찰에서 관심 영역만 추린 함수 실행 횟수 |
| `throttle-run.csv` | 가속 계측 원자료 |
| `listeners-body.json` | `body` 리스너 조사 결과 |
| `original-game.png` | REA 스크린샷 |
| `digests.json` | 아래 대용량 파일들의 SHA-256 |

커밋하지 않은 것(`.tmp/evidence/`, 용량 문제):

| 파일 | 크기 | sha256 (앞 16) |
| --- | ---: | --- |
| `app-graph.json` | 54,156,269 | `2c1db15128a3481b` |
| `observe-web-execution-throttle.json` | 10,934,504 | `a7a6080d498786c0` |
| `inspect-web-page.json` | 6,171,706 | `c4ec9b23f60b3ff6` |
| `screenshot-original.json` | 1,116,352 | `1994fb4387260e1e` |
| `listeners-canvas.json` | 879,438 | `9bfc41d3920f3d08` |

---

## 6. 분석의 한계 (2라운드 기준으로 갱신)

### 아직 남아 있는 한계

1. **소스맵이 없다.** 모든 함수·변수 이름은 번들러 축약명이다. 원본 모듈 구조는 알 수 없다.
2. **WASM 내부를 보지 않았다.** Rapier의 적분기·솔버 동작은 여전히 **[미확인]**이다.
   단, 2라운드에서 **JS → WASM 호출 경계 27종을 전부 열거**해 "무엇을 WASM에 맡기는지"는 확정했다
   (`03-vehicle-controls.md` 10절). 결론: 타이어·서스펜션·구동력 계산은 모두 JS에 있고,
   WASM은 충격량을 받아 적분·레이캐스트만 한다.
3. **`recover-javascript-sources`를 쓰지 못했다.** Wakaru(Linux x64 전용) 의존 → Windows 불가.
   축약 코드를 직접 읽는 방식으로 우회했다.
4. **성능 수치는 측정 환경에 종속된다.** 관찰 시 FPS 30–32, 렌더 해상도 0.50×.
   다른 GPU·창 크기에서는 달라진다.
5. **각 측정은 1회 주행이다.** 통계적 분산을 말할 수 없다.
6. **Codex 세션 내부에서 REA 도구를 호출하지는 않았다.** MCP 서버 자체는 직접 검증했으나
   (1-2절), 클라이언트가 Codex인 경로는 재시작 이후에만 확인 가능하다.
7. **오버테이크 모드·ERS 충전 모델·타이어 마모·기어박스**는 코드 위치만 확인했고
   수식을 끝까지 풀지 않았다.

### 2라운드에서 해소된 한계

| 1라운드 한계 | 현재 상태 | 근거 |
| --- | --- | --- |
| 차종 튜닝 테이블 개별 수치 **[미확인]** | **해소** — 13개 바디 프리셋 + 10개 F1 차량 전부 확정 | `03` 9-1, 9-2절 |
| 조향 각도 3종 **[미확인]** | **해소** — F1 `0.50 / 0.07 / 70` | `03` 9-1절 |
| `availablePower`가 상수인지 불명 | **해소** — ERS 테이퍼 `Rn(v)` 확정 | `03` 9-3절 |
| MCP 경로 미검증 | **부분 해소** — 서버 직접 검증 완료, Codex 경유만 미검증 | `04` 1-2절 |
| WASM 경계 불명 | **해소** — 호출 API 27종 열거 | `03` 10절 |
