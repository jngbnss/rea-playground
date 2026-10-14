# 01 · 분석 개요

## 1. 분석 대상

| 항목 | 값 |
| --- | --- |
| 대상 URL | <https://jngbnss.github.io/f1/> |
| 페이지 제목 | `web-sim-lab · Racing` |
| 분석 시점 | 2026-10-14 (UTC 07:40–07:46) |
| 배포 형태 | GitHub Pages 정적 호스팅 |
| 분석 권한 | 사용자 본인이 제작·배포한 게임 |

**분석 범위는 공개 배포된 산출물뿐이다.** 원본 GitHub 리포지토리의 소스코드는
열람하지도, 사용하지도 않았다. 브라우저가 실제로 내려받아 실행한 JavaScript 번들과
실행 중 관찰 결과만을 근거로 삼는다.

## 2. 분석 목적

1. REA(Reverse Engineer Anything)를 실제로 사용해 배포된 웹 게임의 동작 원리를 밝힌다.
2. **차량 가속**과 **조향**의 입력→계산→화면 반영 경로를 끝까지 추적한다.
3. 추적한 원리를 근거로 별도의 데모를 **자체 구현**하고 원본과 비교한다.

## 3. 사용한 도구

### REA 도구 (실제 실행한 명령)

| 명령 | 용도 | 산출물 |
| --- | --- | --- |
| `rea setup --client codex` | Codex에 REA MCP 등록 + 분석 스킬 설치 | `.codex/config.toml` |
| `rea doctor --client codex --json` | 연결 상태 검증 | `evidence/doctor-codex.json` |
| `rea list-browser-targets` | 디버깅 중인 페이지 target 목록 | — |
| `rea inspect-web-page --include-script-sources` | 페이지 수동 관찰 + 스크립트 원문 보존 | 6.17 MB JSON |
| `rea export-web-scripts` | 보존된 스크립트를 검증된 파일로 추출 | `.tmp/f1-scripts/` |
| `rea analyze-javascript-application` | 추출 번들의 정적 애플리케이션 그래프 생성 | 54.2 MB JSON |
| `rea observe-web-execution` | 실행 카운터를 리셋하고 정밀 실행 관찰 | 10.9 MB JSON |
| `rea inspect-web-event-listeners` | DOM 노드의 네이티브 리스너 위치 조사 | `evidence/listeners-*.json` |
| `rea capture-web-screenshot` | 뷰포트 스크린샷 Evidence | `evidence/original-game.png` |

### 보조 도구 (REA 아님 — 명확히 구분)

| 도구 | 용도 |
| --- | --- |
| Chrome DevTools Protocol `Input.dispatchKeyEvent` | W 키를 **실제로 누른 상태로 유지**하며 가속 반응 계측 |
| 직접 작성한 샘플링 스크립트 | HUD 속도계 텍스트를 100 ms 간격으로 기록 (`evidence/throttle-run.csv`) |

> 위 두 가지는 REA의 분석 결과가 **아니다**. REA가 제공하지 않는 "키를 누른 채 유지"
> 동작을 만들기 위한 자체 계측이며, 보고서에서도 그렇게 표기한다.

## 4. 분석 환경

| 항목 | 값 |
| --- | --- |
| OS | Windows 11 Pro (10.0.26200) |
| Node.js / npm | v24.18.0 / 11.16.0 |
| REA | rea@6.4.0 (CLI 명령 127개, MCP 도구 170개) |
| REA 스킬 | `reverse-engineer-anything` v37 |
| 브라우저 | Chrome 155.0.8059.41, V8 15.5.35.20 |
| 브라우저 프로필 | `.tmp/chrome-rea-profile` (임시 전용) |
| CDP 엔드포인트 | `http://127.0.0.1:9222` (루프백 전용) |

## 5. 처음부터 알고 있던 제한 사항

1. **소스맵 없음** — 9개 스크립트 전부 `source_map_url: null`. 따라서 원본 파일명·변수명을
   복원할 수 없고, 모든 식별자는 번들러가 축약한 이름(`ic`, `yc`, `qt` 등)으로 참조한다.
2. **WebAssembly 내부 미분석** — 물리 엔진이 `rapier_wasm3d_bg.wasm`으로 동작하므로,
   WASM 내부 연산은 이번 분석 범위 밖이다. JS 측 호출 경계까지만 확인했다.
3. **`recover-javascript-sources` 사용 불가** — Wakaru(Linux x64 전용) 의존 (`errors.md` E-003).
   따라서 번들 → 모듈 복원은 수행하지 못했고, 축약된 번들 원문을 직접 읽어 분석했다.
4. **정밀 실행 관찰은 성능에 영향** — `observe-web-execution`은 V8 최적화를 끄므로
   관찰 중 프레임레이트가 떨어진다. 실행 횟수는 유효하지만 **시간 측정에는 쓰지 않았다**.

> 용어 설명
> - **소스맵(source map)**: 압축된 배포 코드를 원본 코드 위치로 되돌려주는 지도 파일.
> - **번들(bundle)**: 여러 소스 파일을 하나로 합치고 이름을 짧게 줄인 배포용 파일.
> - **CDP(Chrome DevTools Protocol)**: 크롬 개발자도구가 쓰는 원격 제어 규약.
> - **WASM(WebAssembly)**: 브라우저에서 네이티브에 가까운 속도로 도는 바이너리 실행 형식.
