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
