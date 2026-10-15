# JOSEON OUTLAW 구현 오류 기록

각 페이즈 시작 전에 이 파일을 확인하고, 실제로 발생한 오류만 기록한다.

## 페이즈 1 — 환경·기술 검증

### P1-E001 · Godot 실행 파일이 PATH에 없음

- 발생 단계: 환경 확인
- 증상: `where godot`, `where godot4` 모두 결과 없음
- 원인: Godot가 시스템에 설치되지 않음
- 복구: 공식 `godotengine/godot-builds` 4.7.2-stable Windows 표준 빌드를 `.tmp/godot/`에 내려받아 프로젝트 도구가 명시적으로 사용하게 한다.
- 상태: 해결

### P1-E002 · Git Bash에서 상대 경로의 GUI Godot 실행 실패

- 발생 단계: 스모크 실행
- 증상: `../../.tmp/godot/Godot_v4.7.2-stable_win64.exe --version`이 `command not found`로 종료
- 원인: 콘솔 출력이 필요한 자동화에서 GUI 서브시스템 실행 파일을 상대 경로로 직접 호출함
- 복구: 자동화 기본값을 절대 경로로 해석되는 `Godot_v4.7.2-stable_win64_console.exe`로 변경했다.
- 상태: 해결

### P1-E003 · Windows 내보내기 도구의 기본 출력 경로 누락

- 발생 단계: 빌드
- 증상: `python -m tools.export_windows`가 `NameError: DEFAULT_OUTPUT is not defined`로 종료
- 원인: Godot 콘솔 실행 파일명 수정 중 인접한 `DEFAULT_OUTPUT` 선언을 잘못 교체함
- 복구: `DEFAULT_BIN`과 `DEFAULT_OUTPUT`을 별도 상수로 복원하고 실제 내보내기·실행까지 재검증했다.
- 상태: 해결

## 페이즈 2 — 플레이어 수직 슬라이스

### P2-E001 · GDScript 파싱 실패로 스모크가 종료되지 않음

- 발생 단계: 구현 / 스모크
- 증상: 헤드리스 스모크가 60초 타임아웃됐고, verbose 에디터 실행에서 `PackedStringArray.any()` 없음과 동적 노드 속성 타입 추론 오류가 출력됨
- 원인: Godot 4.7의 `PackedStringArray`에 `any()`가 없고, `Node`로 추론된 값에서 `global_position` 타입을 추론하려 함
- 복구: 명령행 인자를 명시적 반복문으로 검사하고, 플레이어를 `CharacterBody3D`로 캐스팅한 뒤 사용자 메서드는 `call()`로 호출했다. 이후 이동 4.13m·점프 속도 5.67m/s를 실제 물리 프레임에서 확인했다.
- 상태: 해결

### P2-E002 · 실패 로그 함수 선언을 잘못 덮어씀

- 발생 단계: 오류 진단
- 증상: `_fail_smoke()` 선언이 사라져 메인 스크립트가 파싱되지 않음
- 원인: 함수 본문에 로그를 추가하면서 함수 선언 행까지 교체함
- 복구: 함수 선언을 복원하고 모든 실패 경로가 `SMOKE_FAIL`을 출력하도록 유지했다.
- 상태: 해결
