# 설치 및 환경 구성

이 문서는 **실제로 실행한 명령과 그 결과**만 기록한다.

## 1. 확인된 개발 환경

| 항목 | 값 | 확인 명령 |
| --- | --- | --- |
| OS | Windows 11 Pro (10.0.26200, x64) | — |
| Node.js | v24.18.0 | `node -v` |
| npm | 11.16.0 | `npm -v` |
| Codex CLI | codex-cli 0.155.0 | `codex --version` |
| REA CLI | rea@6.4.0 (npx 실행) | `npx -y rea-agents@latest --version` |
| 브라우저 | Chrome 155.0.8059.41 | CDP `Browser.getVersion` 응답 |
| Git remote | `https://github.com/jngbnss/rea-playground.git` | `git remote -v` |

REA 공식 요구사항은 Node.js 22.19+ / 24.11+ / 26+ 이다(출처: <https://rea.tools/get-started/>).
현재 v24.18.0 이므로 **요구사항 충족**. 별도 Node 설치 불필요.

> 만약 Node 버전이 낮다면 Windows에서는 `winget install OpenJS.NodeJS.LTS` 실행 후
> PowerShell을 다시 열고 `node -v`로 확인한다.

## 2. REA 설치 (Codex 연결)

### 2-1. 설치 계획 먼저 확인

```powershell
npx -y rea-agents@latest setup --client codex --dry-run
```

출력된 계획 2건:

| id | 종류 | 대상 | 동작 | 백업 |
| --- | --- | --- | --- | --- |
| `configure_client:codex` | configure_client | `C:\Users\<user>\.codex\config.toml` | update | `config.toml.rea.backup` |
| `install_skill` | install_skill | `C:\Users\<user>\.agents\skills\reverse-engineer-anything` | install | — |

두 경로 모두 **사용자 홈 디렉터리의 전역 설정**이다. 기존 설정은 덮어쓰지 않고
`config.toml.rea.backup` 백업을 남긴 뒤 REA MCP 등록만 추가한다.

### 2-2. 적용

```powershell
npx -y rea-agents@latest setup --client codex --yes
```

결과: `status: ready`, `appliedActions[2]: configured_codex, installed_skill`.

`.codex/config.toml`에 추가된 내용(실제 확인):

```toml
[mcp_servers.rea]
command = "C:\\Program Files\\nodejs\\node.exe"
args = [ "...\\node_modules\\rea-agents\\scripts\\rea.mjs", "mcp" ]
startup_timeout_sec = 30
```

### 2-3. 연결 검증

```powershell
npx -y rea-agents@latest doctor --client codex --json
```

| 검사 | 결과 |
| --- | --- |
| `healthy` | **true** |
| `scope_checks[0] node` | ok · 24.18.0 |
| `scope_checks[1] registration:codex` | ok · `C:\Users\<user>\.codex\config.toml` |
| `identity.skill.installed_version` | 37 (기대값 37) |
| `catalog.counts` | CLI 명령 127개, MCP 도구 170개, MCP 프롬프트 6개 |
| `environment_healthy` | **false** |

`environment_healthy: false`의 이유는 네이티브 분석 공급자(Ghidra / IDA / Hopper)가
구성되지 않았기 때문이다. 이번 프로젝트는 **JavaScript·웹 분석만** 수행하므로
의도적으로 설치하지 않았다. 웹 분석 경로는 `healthy: true`로 정상이다.

원본 JSON: `docs/evidence/doctor-codex.json`

> **MCP(Model Context Protocol)**: 코딩 에이전트가 외부 도구를 호출할 수 있게 해주는 표준 연결 규격.
> REA는 이 규격의 서버로 등록되어 Codex가 `rea` 도구를 직접 쓸 수 있게 한다.

### 2-4. Codex 재시작

MCP 등록은 **클라이언트 재시작 후** 반영된다.
터미널 에이전트(Codex)는 세션을 종료했다가 다시 실행하면 된다.
재시작 전에도 CLI(`npx rea-agents@latest <command>`)는 그대로 동작하므로,
이번 분석은 전부 CLI 경로로 수행했다(= 재시작 대기 없이 진행 가능).

## 3. 분석용 브라우저 (임시 프로필)

평소 쓰는 Chrome 프로필을 건드리지 않기 위해 **별도 임시 프로필 + 루프백 전용 포트**를 쓴다.

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --remote-debugging-address=127.0.0.1 `
  --user-data-dir=C:/rea-playground/.tmp/chrome-rea-profile `
  --no-first-run --no-default-browser-check --disable-extensions `
  about:blank
```

- `127.0.0.1`로만 바인딩하여 외부 노출 없음.
- 프로필 디렉터리는 `.tmp/`(gitignore 대상)에 둔다.
- 분석이 끝나면 브라우저를 종료한다.

연결 확인:

```powershell
npx -y rea-agents@latest list-browser-targets http://127.0.0.1:9222 --json
```

## 4. 데모 실행

```powershell
cd experiments/f1-recreation
npm install
npm run dev     # 개발 서버
npm run build   # 타입 검사 + 프로덕션 빌드
```

## 5. 설치하지 않은 것 (의도적 제외)

| 도구 | 용도 | 제외 이유 |
| --- | --- | --- |
| Ghidra | 네이티브 바이너리 역컴파일 | 이번 대상은 웹 앱. 1단계 범위 밖 |
| Hopper / IDA | 네이티브 분석 | 동일 |
| Wakaru | `recover-javascript-sources`용 번들 복원기 | **Linux x64 바이너리만 지원** → Windows에서 사용 불가 (`docs/errors.md` E-003) |
