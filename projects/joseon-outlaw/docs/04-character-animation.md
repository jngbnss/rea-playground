# 04. 캐릭터 모델과 애니메이션 후보

> 상태: **자체 절차형 인체 v2 적용 완료.** 플레이어·주민·도적에 인체 비례를 조정한 몸통·목·머리·관절형 팔다리·손발과 역할별 조선 의복을 적용했다.
> 실게임 증거: [`evidence/game/character-realism.png`](evidence/game/character-realism.png)

## 결론 먼저

**현재 빌드는 외부 캐릭터 모델을 사용하지 않는다.** 자체 절차형 메시가 동일한 비례와 재질 규칙을 공유하며 플레이어는 보행 시 팔·다리가 교차 스윙한다. 아래 후보는 향후 스켈레톤 기반 애니메이션으로 전환할 때만 다시 검토한다.

| 역할 | 선택 | 라이선스 |
|---|---|---|
| 베이스 메시 | [Quaternius Universal Base Characters](https://quaternius.itch.io/universal-base-characters) | CC0 |
| 이동·점프·사망 | [Quaternius UAL 1](https://quaternius.itch.io/universal-animation-library) | CC0 |
| 검 콤보·대시·넉백·손짓 | [Quaternius UAL 2](https://quaternius.itch.io/universal-animation-library-2) 무료판 | CC0 |
| 빈 곳 보충(피격, 발도) | [Mixamo](https://www.mixamo.com) | Adobe 약관 (현행 문서 직접 확인 필요) |
| 한복·갓·환도 | **팀이 Blender로 직접 모델링** | 팀 소유 |
| 고증 참고·리토폴로지 원본 | KCISA 아낙네복, 두정갑 (Sketchfab) | CC BY 4.0 |

## 1. 왜 이 조합인가

- **UAL 2 무료판에 검 동작이 이미 있다.** `SWORD_REGULAR_A`, 3타·4타 콤보(`_COMBO`, `_COMBOB`), 회복 프레임(`_REC`), `SWORD_DASH`, `KNOCKBACK`. P0 전투(기본 공격, 피격, 사망)를 이것만으로 거의 채운다.
- UAL 1·2와 베이스 캐릭터는 같은 리그를 쓴다고 홍보한다. 제3자 블로그는 65개 관절 스켈레톤을 공유한다고 하는데, **파일로 직접 확인하지는 않았다.** 1주차 첫 작업이다.
- 모두 CC0이라 공개 저장소에 원본을 커밋해도 되고 크레딧 의무도 없다.
- 유료판(UAL Pro·Source, 베이스 Source)은 합쳐서 약 25달러다. `.blend` 원본과 Godot 예제가 들어 있어 의상 작업 시간을 줄여 준다. **구입을 권한다.**

## 2. 의상 계획 (모듈식 한복 세트 하나)

| 캐릭터 | 구성 | 변형 방식 |
|---|---|---|
| 떠돌이 검객 (주인공) | 저고리, 바지, 두루마기 자락, 갓, 행전, 환도 | 기준 세트 |
| 윤 행수 | 저고리, 조끼(배자), 탕건 | 색·소품 교체 |
| 덕순 주모 | 짧은 저고리, 치마, 앞치마, 머릿수건 | KCISA 아낙네복 참고 |
| 도적 (2명) | 해진 바지, 팔토시·각반, 패랭이 또는 머리띠 | 한 명은 체형만 키워 "덩치" |

- 의상은 베이스 메시 위에 **분리된 메시**로 만들고 같은 스켈레톤에 스키닝한다. 새 캐릭터는 메시가 아니라 **색과 소품 조합**으로 만든다.
- **칼은 일자형 환도로 직접 만든다.** 카타나처럼 휜 칼을 쓰면 바로 일본풍으로 보인다.
- 고증 참고: KCISA(한국문화정보원)와 국가유산청이 Sketchfab에 올린 의복 스캔(흙철릭, 장삼 등)을 레퍼런스로 쓴다.

## 3. Godot 가져오기 절차

1. 가져오기 고급 설정에서 Skeleton3D에 `BoneMap` + `SkeletonProfileHumanoid` 지정 ([공식 문서](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/retargeting_3d_skeletons.html))
2. 자동 매핑 후 빨간색·자홍색 본이 없는지 확인
3. Rest Fixer의 `Fix Silhouette` 사용. 기준 자세는 T-포즈, +Z 정면, Y-up이다. A-포즈 모델은 발이 틀어질 수 있다.
4. 애니메이션은 `AnimationLibrary`로 묶고 `AnimationTree` 하나를 모든 인간형 캐릭터가 공유

## 4. 쓰지 않는 것

| 후보 | 이유 |
|---|---|
| Synty POLYGON Samurai | 일본 봉건시대풍(성, 후지산, 게이샤). 조선으로 보이게 할 수 없다 |
| Quaternius Fantasy 의상 | 유럽 중세풍. 토폴로지 참고로만 쓴다 |
| VRoid | 애니메이션 화풍, 모델별로 조건이 다름 |
| "동양풍(East Asian)" 범용 팩 | 한·중·일이 섞여 있어 한국 관객이 바로 알아챈다 |

## 5. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 팀에 Blender 의상 모델링을 할 사람이 없음 | Fab의 유료 스타일라이즈드 한국 마을 팩(05번 문서)에 캐릭터가 있는지 확인. 없으면 의상을 단순한 형태로 줄이고 텍스처 채색으로 보완 |
| UAL 무료판에 피격 동작이 없음 | Mixamo에서 보충하거나 `KNOCKBACK`을 짧게 잘라 쓴다 |
| 스켈레톤이 실제로는 다름 | 1주차에 확인하고, 다르면 BoneMap을 각각 따로 둔다 |

## 확인하지 못한 것

- Mixamo의 현행 공식 약관(공식 FAQ 접속 403, 2022년 커뮤니티 사본 기준)과 서비스 지속 여부, 검 애니메이션 목록
- Quaternius 베이스·의상·UAL이 정말 같은 스켈레톤인지
- Quaternius 신규 팩이 CC0이 아닌 자체 라이선스("QAL")로 바뀌었다는 제3자 보고 (확인한 팩 페이지는 모두 CC0)
- KCISA 의복 모델의 리그 여부 (API상 애니메이션 0개)
