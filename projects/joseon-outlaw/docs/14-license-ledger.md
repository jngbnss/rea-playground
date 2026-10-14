# 14. 라이선스 대장

> 원본: [`data/license-ledger.csv`](../data/license-ledger.csv)
> 검사: `python -m tools.ledger`, 크레딧 생성: `python -m tools.ledger --credits > CREDITS.md`, 해시: `python -m tools.ledger --hash 파일`

**대장에 없는 파일은 저장소에 넣지 않는다.** 새 에셋이나 의존성을 넣는 PR은 같은 PR에서 대장 행을 추가하거나 고쳐야 하고, CI에서 `python -m tools.ledger`가 통과해야 한다.

## 컬럼

| 컬럼 | 값 | 설명 |
|---|---|---|
| `id` | kebab-case, 고유 | 파일명·커밋 메시지에서 참조할 이름 |
| `name` | 자유 | 표시 이름 |
| `category` | engine, code, plugin, model, weights, character, animation, environment, texture, audio, font, tool | 코드와 모델 가중치, 에셋 라이선스를 **따로** 기록하기 위해 나눈다 |
| `source_url` | https | 실제로 내려받은 페이지 |
| `version_or_commit` | 자유 | 태그, 커밋 해시, 파일 버전 |
| `downloaded_on` | YYYY-MM-DD | 내려받은 날. 라이선스는 바뀔 수 있으므로 그날 기준으로 판단한다 |
| `license` | 자유 | 예: `MIT`, `CC BY 4.0`, `SIL OFL 1.1`, `공공누리 1유형` |
| `license_url` | URL | 라이선스 원문 |
| `commercial_ok`, `modification_ok`, `redistribution_in_build`, `attribution_required` | yes / no / unknown | 승인 시 unknown 금지 |
| `attribution_text` | 자유 | 크레딧에 그대로 들어갈 문구 |
| `modified` | yes / no | 원본을 수정했는지 |
| `sha256` | 64자리 소문자 hex | 원본 파일(압축 파일이면 압축 파일) 해시 |
| `in_final_build` | yes / no | 최종 빌드에 포함되는지 |
| `status` | candidate / approved / rejected | 후보 → 승인 또는 제외 |
| `owner` | 역할명 | 이 항목을 책임지는 사람 |
| `notes` | 자유 | 판단 근거, 주의사항 |

## 검사 규칙 (`tools/ledger.py`)

- **승인된 항목**은 버전, 다운로드일, 라이선스, 라이선스 URL, sha256, 담당자가 모두 있어야 하고 yes/no 칸에 unknown이 없어야 한다.
- **빌드에 들어가는 항목**은 승인 상태여야 하고, 빌드 재배포가 허용되어야 하며, **NC(비영리)·ND(변경 금지) 라이선스는 금지**한다. 시연 영상 공개, 오픈소스화, 포트폴리오 사용과 충돌하기 때문이다.
- 수정한 항목은 수정 허용이 yes여야 한다.
- 저작자 표시가 필요한 승인 항목은 `attribution_text`가 있어야 한다.

## 운영

1. 후보를 찾으면 `candidate`로 행을 추가한다(빈칸 허용).
2. 쓰기로 결정하면 원본을 내려받아 `--hash`로 해시를 기록하고, 라이선스 원문을 직접 읽고 yes/no를 채운 뒤 `approved`로 바꾼다.
3. 쓰지 않기로 하면 `rejected`로 바꾸고 이유를 `notes`에 남긴다. 행을 지우지 않는다. 같은 후보를 다시 검토하는 일을 막는다.
4. 7주차에 `--credits`로 CREDITS.md를 만들어 빌드와 README에 넣는다.

> 이 대장은 법률 자문이 아니다. 공공누리 4유형(변경 금지)이나 출처가 불분명한 "무료" 에셋처럼 애매한 경우는 승인하지 않는다.
