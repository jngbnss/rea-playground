# 05. 환경 에셋 후보와 라이선스

> 상태: **CC0 자산 선정·게임 적용 완료 (2026-10-15).**
> 승인 원본과 해시: [`data/license-ledger.csv`](../data/license-ledger.csv)의 `polyhaven-*` 항목

## 결론 먼저

**저작권 위험이 없는 Poly Haven CC0만 최종 빌드에 채택했다.** 한옥 형태는 자체 절차형 모듈로 유지하고 표면 현실감과 환경광만 검증된 오픈소스 원본으로 교체했다.

| 적용 영역 | 최종 자산 | 적용 맵 |
|---|---|---|
| 숲 지면 | Poly Haven Forest Ground 04 | diffuse·normal·roughness |
| 흙길 | Poly Haven Dirt Floor | diffuse·normal·roughness |
| 한옥 회벽 | Poly Haven Plastered Wall 02 | diffuse·normal·roughness |
| 기둥·문 | Poly Haven Weathered Brown Planks | diffuse·normal·roughness |
| 기와 | Poly Haven Grey Roof Tiles | diffuse·normal·roughness |
| 하늘·환경광 | Poly Haven Qwantani Dusk 1 Pure Sky | 1K HDRI |

전부 `CC0 1.0`이며 상업 이용·수정·게임 빌드 재배포가 가능하고 저작자 표시 의무가 없다. 그래도 출처 추적을 위해 `CREDITS.md`와 라이선스 대장에 이름·URL·파일 해시를 남겼다. 외부 게임을 추출하거나 디컴파일한 자산은 사용하지 않았다.

## 1. 한국 공공 출처

| 출처 | 내용 | 라이선스 | 메모 |
|---|---|---|---|
| [KCISA 창원의 집](https://sketchfab.com/3d-models/d32b0fbc058145169d478137def9e764) (Sketchfab kcisameta) | 안채, 사랑채, 대문, 정자 등 기와 한옥 스캔 | CC BY 4.0 | 25만~65만 면이라 실시간용으로는 무겁다. 서까래, 막새, 창호 같은 부품을 떼어 모듈로 만든다 |
| [KCISA 수내동가옥 초가집](https://sketchfab.com/3d-models/e78d2a2c80b646279e44e2ceaf6a1fd2) | 초가 스캔 2채 | CC BY 4.0 | 7.9만~8.6만 면, 재질 11개. 감량하고 재질을 하나로 통합 |
| [국가유산청 KHS_Asset](https://sketchfab.com/KHS_Asset) | 1,187개. 지게, 짚독, 대바구니, 평상, 빗자루, 소반 등 | 항목별 CC BY | **이미 저폴리**(300~1.2만). 장터 꾸미기에 바로 쓸 수 있다. 장독은 검색되지 않음 |
| [풍영정](https://sketchfab.com/3d-models/pungyeongjeong-pavilion-7fd07bb280514037b67bb2f294862078) | 조선 정자 | CC BY 4.0 | 5.2만 삼각형, 마을 랜드마크 후보 |
| Unity 에셋스토어 KCISA 팩 | 제주목 관아 등 | Unity 에셋스토어 EULA | 다른 엔진에서도 쓸 수 있지만 원본을 공개 저장소에 둘 수 없고 2GB다. Sketchfab CC BY 판이 더 간단하다 |

### 공공누리 유형 정리

| 유형 | 상업 이용 | 변형 | 게임 에셋으로 |
|---|---|---|---|
| 1유형 | 가능 | 가능 | **사용 가능** (출처 표시) |
| 2유형 | 불가 | 가능 | 사용 안 함 |
| 3유형 | 가능 | **불가** | 사용 안 함 (리토폴로지·리페인트가 변형에 해당) |
| 4유형 | 불가 | 불가 | 사용 안 함 |

출처: <https://www.kogl.or.kr/info/license.do>. 데이터마다 유형이 다르므로 **파일마다 확인**하고 대장에 적는다.

## 2. 한옥 모듈 키트 목록 (1안)

| 모듈 | 목표 삼각형 | 비고 |
|---|---|---|
| 기와지붕: 용마루, 처마 직선·모서리, 막새 | 2~6천 | 처마 곡선이 한옥 인상의 대부분이다. 가장 공들일 부품 |
| 초가지붕: 직선, 모서리 | 2~4천 | 이엉 질감은 텍스처와 노멀로 |
| 벽: 회벽+기둥, 창호 문, 판문 | 0.5~2천 | 창호지는 반투명 재질로 실내 조명이 비치게(AreaLight3D) |
| 돌담 직선·모서리·끝, 대문 | 1~3천 | |
| 기단·주춧돌·마루 | 0.5~2천 | |
| 장독(3크기), 장독대 | 300~800 | 회전체라 직접 만드는 게 빠르다 |

텍스처는 하나의 아틀라스 + 손으로 그린 질감(또는 스캔에서 베이크한 뒤 단순화). **텍셀 밀도를 키트 전체에 통일**한다.

## 3. 쓰지 않는 것

| 후보 | 이유 |
|---|---|
| Sketchfab "Hanok"(angelinart), "A Fusion Korean House" | CC BY-NC-SA (비영리·동일조건) |
| "Traditional East Asian-Inspired House" 류 | 한·중·일 혼합 양식 |
| Synty POLYGON Samurai | 일본풍 |
| 공공누리 2~4유형 데이터 | 위 표 참조 |

## 4. 크레딧

CC BY 에셋은 **저작자, 제목, URL, 라이선스 링크, 수정 사항**을 모두 적어야 한다(CC BY 4.0은 수정 사실 표시 필수). 대장의 `attribution_text`에 그대로 적어 두면 `python -m tools.ledger --credits`가 CREDITS.md를 만든다.

## 확인하지 못한 것

- Fab EULA 원문과 hyemster 팩 페이지(접속 403). 가격·구성·폴리곤 수는 검색 결과 요약 기준이다
- KCISA·KHS 원본의 파일 형식(glTF/FBX)
- digital.khs.go.kr의 공공누리 유형과 다운로드 조건, 2026년 6월 약 800건 추가 공개(기사로만 확인)
- Quaternius·Kenney 팩의 삼각형 수
