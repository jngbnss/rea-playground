# 오류 모음 (Error Log)

구현 작업을 시작하기 **전에 이 파일을 먼저 읽는다** (`docs/workflow.md` 1단계).
새 오류는 아래 형식으로 **즉시 추가**한다.

```markdown
### E-00N · <한 줄 제목>
- 발생 단계: <설치 / 분석 / 구현 / 빌드 / 실행>
- 증상: <실제로 본 메시지나 현상 그대로>
- 원인: <확인된 원인 / 추정이면 "추정"이라고 명시>
- 복구: <실제로 통한 조치>
- 상태: 해결 | 우회 | 미해결
```

---

## 라운드 1 — REA 설치 및 원본 게임 분석 (2026-10-14)

### E-001 · `rea` 명령을 찾을 수 없음
- 발생 단계: 설치
- 증상: `rea --version` → `error: command not found: rea`
- 원인: REA CLI를 전역 설치(`npm i -g rea-agents`)하지 않았음. 공식 문서도 전역 설치는 선택사항으로 안내.
- 복구: 모든 호출을 `npx -y rea-agents@latest <command>` 형태로 수행. 전역 설치 없이 정상 동작.
- 상태: 해결

### E-002 · `doctor`가 `healthy: false`, 종료 코드 1
- 발생 단계: 설치
- 증상: setup 실행 전 `doctor --client codex --json`이 종료 코드 1과 `healthy:false` 반환
- 원인: 아직 Codex에 REA MCP가 등록되지 않은 상태였음(정상적인 사전 상태)
- 복구: `setup --client codex --yes` 실행 후 재검사 → `healthy: true`
- 상태: 해결

### E-003 · `recover-javascript-sources` 사용 불가 (Windows)
- 발생 단계: 분석
- 증상:
  ```
  code: capability_unavailable / category: unsupported_provider
  Provide an absolute REA_WAKARU_COMMAND pointing to a Wakaru ^1.13.0 Linux x64 binary
  (verified with 1.14.0); no tool is installed by REA.
  ```
- 원인: 이 명령은 외부 도구 Wakaru에 의존하며, **Linux x64 바이너리만 지원**한다. Windows 호스트에서는 제공 경로가 없다.
- 복구: 번들 → 원본 모듈 복원을 포기하고, `export-web-scripts`로 추출한 **축약 번들 원문을 직접 읽어** 분석했다. 이 한계는 `docs/analysis/04-evidence.md` 6절에 기록.
- 상태: 우회

### E-004 · `capture-browser-scenario` 입력 스키마를 모름
- 발생 단계: 분석
- 증상: `--help`와 `--schema` 모두 `inputJson: string`이라고만 알려 주고 내부 구조를 알려 주지 않음
- 원인: 시나리오 JSON의 스키마가 런타임 검증기에만 존재
- 복구: 의도적으로 빈/잘못된 JSON(`{}`, `{"browser":{},...}`)을 넘겨 **검증 오류 메시지로 필수 필드를 역추적**했다.
  → `browser.mode (launch|connect)`, `browser.cdp_endpoint`, `browser.target_id`, `start_url.url`,
    `actions[].action ∈ {goto, click, fill, press, select_option, check, uncheck, wait_for, wait_for_timeout}`
- 상태: 해결

### E-005 · REA 출력 `JSON.parse` 실패
- 발생 단계: 분석
- 증상: `analyze-javascript-application --json` 결과(54 MB)를 `JSON.parse`하면 `SyntaxError: Unable to parse JSON string`
- 원인: 출력이 단일 JSON이 아니라 **JSONL**이다. 앞쪽 23줄은 `{"rea_progress":{...}}` 진행 로그이고 **마지막 줄만 최종 Evidence**다.
- 복구: `stdout.split("\n").filter(Boolean).at(-1)` 를 파싱. `scripts/capture-and-analyze.mjs`의 `rea()` 헬퍼에 반영.
- 상태: 해결

### E-006 · Evidence 파일이 과대 용량
- 발생 단계: 분석
- 증상: `app-graph.json` 54.2 MB, `observe-web-execution` 10.9 MB, `inspect-web-page` 6.2 MB. 그대로 커밋하면 저장소가 비대해짐
- 원인: REA Evidence는 원문·그래프를 모두 포함하는 완전 기록 형식
- 복구: 대용량 원본은 `.tmp/evidence/`(gitignore)에 두고, **요약본 + SHA-256 다이제스트**만 `docs/evidence/`에 커밋. 재현은 `scripts/capture-and-analyze.mjs`로 가능.
- 상태: 해결

### E-007 · 정밀 실행 관찰 중 프레임레이트 급락
- 발생 단계: 분석
- 증상: `observe-web-execution` 9초 창에서 루프 `tick` 실행이 21회에 그침(= 약 2.3 FPS). 평소 30–32 FPS
- 원인: REA가 한계로 명시한 대로 정밀 커버리지는 **V8 최적화를 비활성화**한다
- 복구: 실행 횟수는 "실행되었는가"의 근거로만 쓰고, **FPS·시간 성능 해석에는 사용하지 않음**. 성능 비교는 별도의 일반 실행에서 측정.
- 상태: 해결 (해석 규칙으로 처리)

### E-008 · 분석용 Chrome 프로세스가 중간에 종료됨
- 발생 단계: 분석
- 증상: 문서 작성 중 감시 프로세스 `cdp-chrome`이 exit code 0으로 종료. 이후 CDP 연결 불가
- 원인: 추정 — 브라우저 창이 닫히면 Chrome 프로세스 트리가 정상 종료된다. 분석 작업 중 탭/창이 닫힌 것으로 보임
- 복구: 필요한 캡처는 종료 전에 모두 확보되어 있었다. 재측정이 필요하면 `docs/setup.md` 3절 명령으로 다시 기동 후 `scripts/measure-throttle.mjs` 재실행
- 상태: 해결

---

## 라운드 2 — 데모 구현 (2026-10-14)

### E-009 · 감시 프로세스로 `npm`을 띄우지 못함 (Windows)
- 발생 단계: 실행
- 증상:
  ```
  Failed to spawn PTY command: CreateProcessW `"C:\Program Files\nodejs\npm" run preview …`
  failed: %1은(는) 올바른 Win32 응용 프로그램이 아닙니다. (os error 193)
  ```
- 원인: Windows의 `npm`은 실행 파일이 아니라 셸 스크립트(`npm` / `npm.cmd`)다. `CreateProcessW`로 직접 실행할 수 없다.
- 복구: 래퍼를 건너뛰고 Node로 Vite 바이너리를 직접 실행
  `node node_modules/vite/bin/vite.js preview --port 4173 --strictPort`
- 상태: 해결

### E-010 · preview 서버 준비 감지 실패 (127.0.0.1 vs localhost)
- 발생 단계: 실행
- 증상: Vite가 `➜ Local: http://localhost:4173/`를 출력했는데도 `127.0.0.1:4173` TCP 준비 검사가 60초 타임아웃
- 원인: 추정 — `vite preview`가 `localhost`에 바인딩하면서 IPv6(`::1`)로 먼저 열려 IPv4 루프백 검사가 실패
- 복구: 로그에서 서버 기동을 확인한 뒤 브라우저는 `http://localhost:4173/`로 접속. 동작에 문제 없음
- 상태: 우회

### E-011 · 백그라운드 탭에서 측정값이 전부 0 (가장 중요)
- 발생 단계: 실행 / 측정
- 증상: 원본 게임 탭에서 W를 5초 눌러도 속도가 계속 0. HUD의 FPS 표시가 `–` 또는 `2`, 프레임 시간 613 ms
- 원인: Chrome이 **백그라운드 탭의 `requestAnimationFrame`을 강하게 억제**한다. 데모 탭을 앞에 띄운 뒤 게임 탭을 측정하려 해서 게임 루프가 거의 돌지 않았다
- 복구: 측정 직전에 대상 탭을 전면으로: CDP `Page.bringToFront`. 적용 후 정상 측정(FPS 30대 복귀)
- 상태: 해결
- 교훈: **브라우저 계측은 반드시 대상 탭을 전면에 두고 수행한다.** 이 함정을 모르면 "가속이 안 된다"는 잘못된 분석 결론으로 이어진다

### E-012 · `tab.run` 내부 `page.evaluate`에서 `window.__demo`가 보이지 않음
- 발생 단계: 측정
- 증상: HUD 텍스트(`document.querySelector`)는 읽히는데 `window.__demo.vehicle.yawRate`는 계속 `undefined`
- 원인: 추정 — 해당 평가가 페이지의 기본 실행 월드가 아닌 격리 월드에서 수행되어 페이지 전역이 보이지 않음
- 복구: 키 이벤트 전송만 `tab.run`으로 하고, 상태 샘플링은 메인 월드에서 도는 `tab.evaluate`로 분리
- 상태: 해결

### E-013 · 차량이 벽에 걸린 상태로 측정되어 결과가 무의미
- 발생 단계: 측정
- 증상: 제동 측정에서 시작 속도가 33 km/h, 이후 17 km/h에서 멈춘 채 변하지 않음
- 원인: 직전 주행에서 코스를 이탈해 장애물에 붙어 있었음. `R`(리셋)로도 같은 지점에 복귀
- 복구: 페이지를 새로 로드해 그리드에서 다시 시작한 뒤, 가속 5.2초 → 제동 순서로 측정. 매 측정 전 시작 속도를 로그로 남겨 유효성 확인
- 상태: 해결

### E-014 · 데모 빌드
- 발생 단계: 빌드
- 증상: 없음
- 원인: —
- 복구: —
- 상태: **신규 오류 없음.** `npm run build` → `tsc --noEmit` 타입 오류 0, `✓ built in 169ms`, `dist/assets/index-Cj9_Hwt8.js 552.29 kB`

---

## 라운드 3 — 미확인 항목 해소 + 데모 물리 보강 (2026-10-14)

### E-015 · MCP `tools/call` 인자 이름 불일치
- 발생 단계: 검증
- 증상:
  ```
  Input validation error: Invalid arguments for tool list_browser_targets:
  cdp_endpoint: Invalid input: expected string, received undefined,
  Unrecognized key: "endpoint"
  ```
- 원인: CLI는 위치 인자 이름이 `endpoint`지만, MCP 도구 스키마의 키는 `cdp_endpoint`다. 두 표면의 인자 이름이 다르다.
- 복구: `tools/list` 응답의 `inputSchema`를 먼저 읽고 그 키를 그대로 사용. 재호출 시 `isError` 없이 Evidence 반환
- 상태: 해결
- 교훈: **MCP 도구 인자는 CLI `--help`가 아니라 `tools/list`의 스키마를 봐야 한다.**

### E-016 · 감시 프로세스 Chrome이 즉시 종료되는 현상 (E-008 후속)
- 발생 단계: 분석
- 증상: `ready` 판정 직후 exit code 0. 같은 `--user-data-dir`을 재사용한 두 번째 기동에서 재현
- 원인: 추정 — 직전 인스턴스가 프로필 락을 쥔 채 종료 중이면, 새 프로세스가 기존 인스턴스에 요청을 넘기고 자신은 즉시 종료한다. 포트가 아직 열려 있어 준비 검사는 통과해 버린다
- 복구: ① 프로필 디렉터리를 새로 지정(`chrome-rea-2`, `chrome-rea-3`) ② `detached: true`로 기동 ③ 기동 후 `GET /json/version`으로 실제 응답을 확인
- 상태: 해결

### E-017 · 표기 최고속과 실제 최고속이 다름 (분석 함정)
- 발생 단계: 분석
- 증상: 차량 테이블의 Ferrari `top = 348 km/h`를 그대로 최고속으로 쓰려 했으나, 실제 설정 빌더가 값을 덮어씀
- 원인: 번들의 `er()`가 특성 보정(`traits`)을 반영해 **40회 이분탐색으로 최고속을 다시 푼 뒤 `e.top`에 재대입**한다. 테이블 값은 입력이지 결과가 아니다
- 복구: 번들의 계산 과정을 그대로 재실행 → 실제 최고속 **352 km/h**(97.756 m/s) 확정. 데모도 이 값을 사용
- 상태: 해결
- 교훈: **데이터 테이블의 값을 "결과"로 착각하지 말 것.** 그 값을 읽는 코드까지 따라가야 한다.

## 라운드 4 — 액티브 에어로 + 4륜 서스펜션 (2026-10-14)

### E-018 · 서스펜션 피치 입력에 회전 좌표계 항이 섞여 스핀이 폭주
- 발생 단계: 구현 / 측정
- 증상: 150 km/h에서 D를 유지하자 1.2초 만에 `yawRate`가 7 rad/s까지 치솟고 뒤 바퀴 하중이 **0 N**,
  앞 바퀴 하중은 13,516 N까지 올라갔다. 차체 속도는 140 → 14 km/h로 붕괴
- 원인: 하중 이동 입력으로 쓰던 `longAccel`을 **실측 속도차**(`(vx - vxBefore)/dt`)로 계산했는데,
  이 값에는 회전 좌표계 보정항 `yawRate·vy`가 들어 있다. 스핀 중에는 이 항만으로 −198 m/s²가 나왔고,
  그 가짜 가속도가 피치 모멘트 → 뒤 하중 0 → 뒤 그립 0 → 더 큰 스핀으로 되먹임됐다
- 복구: 피치 입력을 **타이어·공기력 합력 기준**(`longForce / mass`)으로 바꿨다. 횡방향은 처음부터
  타이어 횡력만 쓰고 있었다(`-yawRate·vx` 제외). 같은 시나리오에서 `yawRate`가 −0.7 rad/s로 수렴
- 상태: 해결
- 교훈: **차체 좌표계의 "속도 미분"은 가속도계가 아니다.** 하중 이동에 넣을 값은 외력 합이지
  회전 좌표계 항이 섞인 속도 변화량이 아니다. 축 2개 정적 모델일 때는 하중이 0으로 내려가도
  그립이 완전히 사라지지 않아 증상이 가려져 있었다.

### E-019 · 월드 경계 클램프 때문에 최고속을 측정할 수 없음
- 발생 단계: 측정
- 증상: 전력 가속 45초 샘플에서 0→100은 2.60 s로 정상인데 이후 속도가 36 km/h로 떨어져 있었다
- 원인: 데모의 평지 월드 경계(`worldLimit 1900 m`)에 닿으면 `forwardSpeed *= 0.5`가 **매 스텝** 걸린다.
  300 km/h 구간에서는 10초 남짓이면 경계에 닿는다
- 복구: 계측 중에만 `window.__demo.vehicle.params.worldLimit = 1e9`로 해제. 코드는 그대로 둔다
- 상태: 해결(계측 절차)
- 교훈: 데모의 안전장치가 계측을 왜곡할 수 있다. **가속 곡선이 꺾이면 물리부터 의심하지 말고
  경계·리미터 같은 장치부터 확인할 것.**

### E-020 · 브라우저 평가 30초 상한으로 장시간 계측이 중단됨
- 발생 단계: 측정
- 증상: 45초 샘플링을 한 번의 페이지 평가로 돌리자 `Browser code execution timed out after 30000ms`
- 원인: 도구의 페이지 평가 호출 자체에 30초 상한이 있다
- 복구: 키 입력은 `keydown`만 보내 눌린 상태를 유지한 채, **샘플링만 24초 단위로 쪼개** 연속 호출했다.
  `keyup`은 마지막 호출에서 한 번만 보낸다
- 상태: 해결
- 교훈: 상태(눌린 키)는 페이지에 남으므로, 긴 계측은 "상태 유지 + 샘플링 분할"로 우회할 수 있다.

## 라운드 5 — 브레이크 보조 + 바퀴별 힘 해석 (2026-10-14)

### E-021 · 횡속도 소거 상한을 차체 좌표계로 계산해 차가 전혀 돌지 않음
- 발생 단계: 구현 / 측정
- 증상: 조향각은 `0.09450 rad`까지 정상인데 `yawRate`가 **모든 구간에서 정확히 0**. 핸드브레이크도 무반응
- 원인: 원본의 상한 `E = |l| * massPerWheel * b / dt` 에서 `l`은 **바퀴 좌표계** 횡속도(슬립 속도)다.
  이를 차체 좌표계 횡속도로 구현하면 직진 중 조향한 순간 `l ≈ 0` → 상한 0 → 횡력 0 → 영원히 직진한다
- 복구: 앞축은 조향각만큼 회전시켜 계산 — `l = (vy + r·a)·cosδ − vx·sinδ`
- 상태: 해결
- 교훈: **"바퀴 기준 값"을 차체 기준으로 옮길 때는 조향 회전을 빠뜨리지 말 것.**
  상한이 0이 되는 구현 실수는 힘이 폭주하는 실수보다 조용해서 더 늦게 들킨다.

### E-022 · 추정으로 채운 상수 4건이 모두 틀렸던 것으로 확인됨
- 발생 단계: 분석
- 증상: 번들의 바퀴 힘 블록을 통째로 읽자 라운드 1–4에서 `[자체설계]`로 둔 값이 실제와 달랐다
- 원인: 조각(슬립각 식, 서스펜션 식)만 따로 읽고 **같은 함수의 나머지 절반을 읽지 않았다**
- 복구: 락 횡력 0.35 → **0.25**, 핸드브레이크 `mass·G·1.5` → **mass×6**,
  마찰원 `sqrt(1-r²)` → **마찰타원 정규화**, μ의 기계그립 항 `tune.grip` → **차종보정 `mechGrip`**
- 상태: 해결
- 교훈: **인용 구간을 함수 경계까지 넓혀서 읽을 것.** "필요한 식만 잘라 읽기"는 추정 항목을
  실제보다 많이 남긴다. 추정값이 그럴듯하게 동작했다는 사실은 그 값이 맞다는 증거가 아니다.
