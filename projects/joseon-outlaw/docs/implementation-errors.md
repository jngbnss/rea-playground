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
