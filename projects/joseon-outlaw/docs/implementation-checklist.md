# JOSEON OUTLAW 구현 체크리스트

각 페이즈는 `오류 기록 확인 → 구현 → 실제 실행 스모크 → 오류 기록 → 검증 → PR 병합` 순서로 진행한다. `[x]`는 명시된 확인 방법을 실제 실행한 경우에만 표시한다.

## 페이즈 1 — 환경·기술 검증

- [x] Godot 4.7.2 표준 빌드 실행
- [x] 빈 프로젝트를 헤드리스로 로드
- [x] Windows 실행 파일 내보내기
- [x] 내보낸 실행 파일 기동
- [x] 시연 PC CPU·GPU·RAM·OS 기록
- [x] Git LFS 설치 확인
- [x] 프로젝트 전용 스모크 명령 마련

검증: Godot `4.7.2.stable`, `SMOKE_OK phase=1`, Windows 빌드 `109,138,464 bytes` 기동, Git LFS `3.7.1`. 실제 OpenGL/NVIDIA 렌더 화면은 [`evidence/game/phase1.png`](evidence/game/phase1.png)에서 확인했다.

## 페이즈 2 — 플레이어 수직 슬라이스

- [x] `CharacterBody3D` 기반 이동·달리기·점프
- [x] 마우스 3인칭 카메라와 벽 충돌
- [x] 절차 생성 캐릭터와 이동 상태 표현
- [x] 입력이 실제 위치·속도·카메라 상태를 변경
- [x] 자동 플레이어 스모크 통과

검증: 실제 물리 프레임에서 달리기 4.13m, 점프 초기 속도 5.67m/s, 카메라 벽 충돌 시 SpringArm 5.50m → 1.87m. 렌더 결과는 [`evidence/game/phase2.png`](evidence/game/phase2.png).

## 페이즈 3 — 월드·퀘스트

- [x] 마을·산길·도적 소굴 오픈존 구현
- [x] 윤 행수·덕순 주모 NPC 구현
- [x] 거리 기반 상호작용과 대화 UI
- [x] 장부 퀘스트 상태 전환
- [x] 목표 HUD가 퀘스트 상태를 반영
- [x] 자동 퀘스트 스모크 통과

검증: NPC 2명, 마을·산길·소굴 랜드마크, 잘못된 완료 전이 차단, `not_started → accepted → item_recovered → completed`를 자동 검사했다. 렌더 결과는 [`evidence/game/phase3.png`](evidence/game/phase3.png).

## 페이즈 4 — 전투·적 AI

- [x] 검 공격과 공격 판정
- [x] 플레이어·적 체력, 피격, 경직, 사망
- [x] 도적 순찰·감지·추적·공격·복귀
- [x] 도적 2명의 공격 토큰 공유
- [x] 자동 전투 스모크 통과

검증: 검 3회 적중으로 도적 체력 `60 → 0`, 경직·사망 전이, 도적 2명의 동시 공격자 수 1, 플레이어 피격을 실제 물리 프레임에서 확인했다. 렌더 결과는 [`evidence/game/phase4.png`](evidence/game/phase4.png).

## 페이즈 5 — 전체 완주

- [x] 도적 처치 후 장부 획득
- [x] 마을 지름길 귀환
- [x] 장부 제출과 보상
- [x] 사망 시 체크포인트 부활
- [x] AI 서버 없이 시작부터 엔딩까지 완주
- [x] 자동 완주 스모크 통과

검증: `수락 → 도적 2명 처치 → 장부 회수 → 지름길 → 제출 → 50냥 → 엔딩`과 체력 0 이후 체크포인트 부활을 한 실행에서 확인했다. 렌더 결과는 [`evidence/game/phase5.png`](evidence/game/phase5.png).

## 페이즈 6 — AI 대화

- [x] FastAPI 서버와 `/health`, `/v1/dialogue` 구현
- [x] 요청·응답 스키마와 정책 검증 연결
- [x] 퀘스트 상태별 대사 캐시
- [x] Godot HTTP 클라이언트 연결
- [x] 2초 타임아웃과 고정 대사 fallback
- [x] 서버 중단 상태에서도 완주 가능
- [x] AI 통합 스모크 통과

검증: 서버 중단 시 즉시 fallback·전체 완주, 실행 시 FastAPI 건강 확인·잘못된 계약 422·검증 대사·Godot 캐시 적중을 확인했다. qwen3:4b-instruct 40문항 실측 결과를 남겼고 품질·VRAM 기준 미달로 자유 입력은 비활성화했다. 렌더 결과는 [`evidence/game/phase6.png`](evidence/game/phase6.png).

## 페이즈 7 — 완성·배포

- [x] 조선풍 절차 생성 환경·UI·사운드 적용
- [x] 튜토리얼과 설정·일시정지 UI
- [x] 성능·메모리 측정 로그
- [x] 10회 연속 자동 완주
- [x] Windows 릴리스 빌드 생성
- [x] GitHub Actions에서 Python·Godot 검사와 빌드 수행
- [x] 실행·조작·배포 문서 최신화
- [x] 최종 화면 캡처와 실행 파일 기동 확인

검증: 10/10 연속 완주, Python 52개 테스트, FastAPI→Godot 통합, 표준 런타임 124~145 FPS·정적 메모리 50.6MiB, 109,205,984바이트 Windows 실행 파일 기동을 확인했다. [GitHub Actions Linux 검사·Windows 아티팩트 빌드](https://github.com/jngbnss/rea-playground/actions/runs/38663533894)도 통과했다. 최종 렌더는 [`evidence/game/phase7.png`](evidence/game/phase7.png).

## 실사형 인간 업그레이드

- [x] MakeHuman 공식 core assets의 CC0 조건 확인
- [x] 동아시아 얼굴·피부·눈·눈썹·머리카락을 포함한 인간 베이스 생성
- [x] 자연 A-포즈·미터/Z-up·104본 스킨 GLB 변환
- [x] 플레이어·주민·도적이 한 GLB를 공유하도록 전환
- [x] 역할별 저고리·두루마기·띠·갓·머리싸개·무기 유지
- [x] 이동 체중 이동과 플레이어·도적 공격 동작 연결
- [x] 실게임 OpenGL 렌더에서 얼굴·손·자연 팔 자세 확인
- [x] 전체 완주·AI 통합·Windows 빌드 회귀 확인
- [x] 최종 GLB SHA-256·CC0 원장·크레딧 기록

검증: Python 52개 테스트, 페이즈 7 전체 완주, FastAPI→Godot 통합, 독립 GLB 재임포트, Windows 실행 파일 `147,465,048 bytes` 생성·기동이 통과했다. 최종 실게임 렌더는 [`evidence/game/human-realism.png`](evidence/game/human-realism.png).

## 자연스러운 인간 실루엣 재구현

- [x] MakeHuman 의상 재질의 투명도·컬링 문제 확인
- [x] 사람을 가리던 캡슐 몸통·원통 치마 완전 제거
- [x] 실제 어깨·허리·팔 치수 기반 저고리·소매·두루마기 GLB 적용
- [x] 손·발·머리·목이 의상과 자연스럽게 이어지는지 실화면 확인
- [x] 갓 크기 축소와 환도 칼날·손잡이·코등이 분리
- [x] 3.25m 근접 카메라에서 플레이어·주민 인체 실루엣 확인
- [x] Python 52개 테스트·전체 완주·AI 통합·Windows 빌드 통과

검증: OpenGL 실게임 렌더 [`evidence/game/human-natural.png`](evidence/game/human-natural.png)에서 원통형 대체물이 없는 머리·몸통·양팔·양손·양다리·발 실루엣을 확인했다. Windows 실행 파일 `147,534,360 bytes` 생성·기동도 통과했다.
