# 09. Godot 버전과 플러그인 호환성 표

> 상태: 우선 후보 조사 (조사일 2026-10-14). 버전과 플러그인은 1주차 스파이크에서 **실제로 설치·빌드한 뒤** 확정한다.
> 모든 수치는 공식 릴리스 노트·README·이슈 기준이며, 아직 프로젝트 호환성을 직접 확인하지 않았다.

## 1. 엔진 버전 결정

| 항목 | 내용 |
|---|---|
| **우선 후보** | **Godot 4.7.2-stable, 표준 빌드(.NET 아님)**, 2026-08-18 릴리스. 스파이크 통과 후 잠금 |
| 대체 버전 | 4.6.3-stable (2026-05-20). 4.6과 4.7 모두 전체 지원 중 |
| 금지 | 프로젝트 기간 중 **4.8로 올리지 않는다.** 4.8은 2026-09-29 기능 동결, Q4 출시 예정이라 7주 안에 나올 수 있다. |
| 물리 | 내장 **Jolt** (4.6부터 새 프로젝트 기본값). 애드온 버전은 쓰지 않는다. |
| 렌더러 | Forward+. 4.6부터 Windows 새 프로젝트 기본이 **D3D12**다. 1주차에 D3D12와 Vulkan을 볼류메트릭 포그·라이트맵 장면으로 비교하고 하나로 고정한다. |

출처: <https://godotengine.org/download/archive/>, <https://godotengine.org/article/maintenance-release-godot-4-7-2/>, <https://docs.godotengine.org/en/stable/about/release_policy.html>, <https://godotengine.org/releases/4.6/>

### 비주얼 관련 기능 (아트 디렉션과 연결)

| 기능 | 도입 | 활용 |
|---|---|---|
| AgX 톤매퍼 | 4.4, 4.6에서 `agx_white`/`agx_contrast` 조절 가능 | 해 질 녘 하이라이트가 하얗게 날아가지 않게. 기본 톤매퍼로 사용 |
| LightmapGI 섀도마스크·바이큐빅 샘플링 | 4.4 | 마을 정적 조명은 베이크, 가까운 그림자만 실시간 |
| 글로우가 톤매핑 전에 섞임 | 4.6 | 4.5 이하 튜토리얼 값을 그대로 쓰면 결과가 다르다 |
| SSR 개편, 옥타헤드럴 반사 프로브 | 4.6 | 비 온 뒤 마당, 개울 반사 |
| AreaLight3D | 4.7 | 주막 창호지 너머 실내 조명 |
| IK 프레임워크 (`TwoBoneIK3D` 등) | 4.6, 문서는 작업 중 | 발 IK로 경사로 발 미끄러짐 보정. P2 |

## 2. 플러그인

| 플러그인 | 용도 | 버전 | 4.7 호환 근거 | 라이선스 | 판정 |
|---|---|---|---|---|---|
| [Phantom Camera](https://github.com/ramokz/phantom-camera/releases) | 3인칭 카메라, 프레이밍, 카메라 흔들림 | v0.11.0.3 | 4.7.1 autoload 버그 수정 포함 | MIT | 후보 (기본 카메라로 부족할 때만) |
| [LimboAI](https://github.com/limbonaut/limboai/releases) | 행동 트리 + 계층 상태 기계, 시각 디버거 | v1.8.1 | v1.8.0에서 4.7 지원 추가 | MIT | 보류 (기본 FSM 우선) |
| [gdUnit4](https://github.com/godot-gdunit-labs/gdUnit4) | 단위·씬 테스트, CI 실행기 | v6.2.2 | README: 4.5–4.7.1 | MIT | 후보 (게임 프로젝트 생성 후 검증) |
| [Beehave](https://github.com/bitbrain/beehave/releases) | 행동 트리 (순수 GDScript) | v2.9.3 | "최신 Godot 4.7 호환" | MIT | 후보 (LimboAI 대안) |
| [Dialogic 2](https://github.com/dialogic-godot/dialogic/releases) | 대화 타임라인·UI | 2.0-alpha-20 | 4.7 수정 포함, **알파** | MIT | 후보 |
| [Terrain3D](https://github.com/TokisanGames/Terrain3D/releases) | 지형 조각, 풀 인스턴싱 | v1.0.2-stable | 릴리스는 4.6까지 명시, 메인테이너가 [#993](https://github.com/TokisanGames/Terrain3D/issues/993)에서 "4.7 알려진 문제 없음" | MIT | 후보 |
| [ProtonScatter](https://github.com/HungryProton/scatter) | 소품·풀·바위 절차적 배치 | main (커밋 고정) | 4.7 수정이 main에만 있음 | MIT (동봉 텍스처 일부 별도 약관) | 후보 |
| [GUT](https://github.com/bitwes/Gut) | 단위 테스트 | v9.7.1 (4.7용 브랜치) | 9.7.0에서 double 동작 변경 | MIT | 후보 (gdUnit4와 둘 중 하나) |
| [HTTPEventSource](https://godotengine.org/asset-library/asset/3316) | SSE 스트리밍 수신 | 1.1 | 4.0+ | MIT | 토큰 스트리밍이 필요할 때만 |
| [Spatial Gardener](https://github.com/dreadpon/godot_spatial_gardener) | 풀 페인팅 | v1.4.1 | 4.4 기준, 19개월 업데이트 없음 | MIT | **제외** |
| [Godot Jolt 애드온](https://github.com/godot-jolt/godot-jolt/releases) | Jolt 물리 | v0.16.0 | 4.6까지만 지원 | MIT | **제외** (내장 사용) |

### 판단 원칙

- **첫 수직 슬라이스는 외부 플러그인 없이 만든다.** `SpringArm3D`, `AnimationTree`, `NavigationAgent3D`, `enum` 기반 FSM으로 이동·카메라·적 1명을 먼저 완성한다.
- 기본 기능으로 요구사항을 충족하지 못한 경우에만 플러그인을 하나씩 추가한다. Phantom Camera와 LimboAI는 P0 선행 조건이 아니다.
- **대화 UI는 직접 만든다 (Dialogic 미채택 기본안).** 우리 대화는 FastAPI가 주는 JSON 한 개와 고정 선택지뿐이라 타임라인 편집기가 필요 없다.
- **지형:** 맵이 작다. 마을과 산길을 Blender에서 메시 하나로 만들고 Terrain3D는 산길 지형이 메시로 감당이 안 될 때만 쓴다.
- **히트스톱:** 별도 라이브러리 없이 구현한다. 카메라 흔들림은 기본 카메라로 먼저 만들고 부족할 때 Phantom Camera를 검토한다.
- **LLM 스트리밍:** 기본은 `HTTPRequest`로 JSON 한 번에 받는다. 사전 생성 캐시와 2초 fallback으로도 부족할 때만 SSE를 도입한다.

## 3. 알려진 주의사항

- Phantom Camera: `Node not found: "PhantomCameraManager"` 오류가 Godot PR [#121509](https://github.com/godotengine/godot/pull/121509)에 달려 있다고 한다. 4.7.2에 들어갔는지는 **확인하지 못했다.** 1주차에 직접 확인한다.
- Dialogic alpha-19 이하는 4.6.x까지만 지원한다.
- GUT는 에셋 라이브러리 버전(9.6.1)이 4.6용이다. 4.7에서는 GitHub 9.7.1을 쓴다.
- Beehave도 에셋 라이브러리는 2.9.2라, 4.7.1 싱글턴 충돌 수정을 받으려면 GitHub에서 받는다.
- LimboAI GDExtension zip의 라벨은 4.6이다. 4.7에서 동작한다고 명시되어 있지는 않으므로 직접 확인한다.
- 플러그인은 `addons/`에 **커밋 해시나 태그를 고정해** 넣고, 14번 라이선스 대장에 버전을 적는다.

## 4. 1주차 스파이크 확인 목록

- [ ] 4.7.2 표준 빌드로 빈 프로젝트 → Windows 내보내기 → 다른 PC에서 실행. 실패하면 4.6.3으로 동일 절차 반복
- [ ] D3D12와 Vulkan 비교 (포그 + 라이트맵 장면 FPS, 시각 차이)
- [ ] 기본 노드만으로 이동·카메라·적 `enum` FSM 프로토타입 완성
- [ ] 필요한 플러그인만 한 번에 하나씩 설치하고 에디터 재시작·내보내기 확인
- [ ] 휴머노이드 리타기팅(BoneMap + SkeletonProfileHumanoid)으로 애니메이션 1개 적용
- [ ] `HTTPRequest`로 FastAPI 왕복

## 확인하지 못한 것

- 4.6과 4.7에서 SDFGI나 볼류메트릭 포그가 바뀌었는지 (릴리스 노트에 언급 없음)
- 4.6과 4.7에서 애니메이션 리타기팅 쪽 변경 사항
- 4.8 정식 출시일 (Q4 2026 예상만 확인)
- Godot 4.7.2와 어떤 플러그인 조합도 실제 프로젝트에 설치해 보지 않았다.
