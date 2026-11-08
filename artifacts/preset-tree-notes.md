# 프리셋 트리 소스 노트 (t572u)

워크북(XLSX)은 이 추출에 포함하지 않는다. 아래 JSON이 엑셀 트리의 유일한 소스 데이터다.

## 산출물

- `artifacts/preset-tree.json`
- `artifacts/preset-tree-notes.md` (이 파일)
- 박스 복사본: `/opt/cursor/artifacts/preset-tree.json`, `/opt/cursor/artifacts/preset-tree-notes.md`

## 범위

| 층 | 상태 | 설명 |
|---|---|---|
| 앱 기본 칩 트리 | 포함 | `DEFECT_COMPONENT_PRESET` × `getDefectTypePresetFor` × `getCauseDisplayGroups` × `getDefaultCausePresetList`. 코드에 있는 조합만. |
| 접합부 작곡 | 별도 | 칩에 없는 `DEFECT_JOINT_COMPONENT_PRESET` 두 개만. 좌×우 교차곱은 만들지 않음. |
| company-vocab 보충 | 포함(가져오기 전용) | `js/core/company-vocab.js` READ ONLY. 엑셀 가져오기 변환·원인 표기 통일. 칩 목록을 바꾸지 않음. |
| 계정 커스텀 프리셋 | **unavailable** | `customDefectTypes` / `customDefectCauses` / `customDefectComponents` / `defectPinPresets`는 회사 Firestore·기기 localStorage. 저장소에 없음. Firebase 실데이터 읽지 않음. |
| t571u 제외 연관 | 별도 섹션 | 미배포. 배포본 트리는 그대로 두고 제안 제외분만 기록. |

## 소스 커밋

- **배포 기준(current deployed baseline)**: `c3f9122b47477255b518e585c849870ab28dc0d7` (`c3f9122`) 2026-11-06T02:22:37+00:00 — web-version.json 배포 버전 갱신 (a246cab)
- **t571u 제안 정리(proposed cleanup, unreleased)**: `deea9059a55910db2e63f4b353a418ba26e03d97` (`deea905`) 2026-11-06T02:26:31+00:00 — 기본 원인 제안에서 명백히 안 맞는 결함 조합만 제외
- 트리의 `causesDeployed`는 배포 기준. `causesProposed`는 목록이 달라질 때만 붙임.

## 소스 경로 (줄 번호는 각 커밋의 app.js)

| id | path | deployed | proposed |
|---|---|---:|---:|
| DEFECT_COMPONENT_PRESET | `app.js` | 27191 | 27191 |
| DEFECT_JOINT_COMPONENT_PRESET | `app.js` | 27182 | 27182 |
| DEFECT_TYPE_ALLOW | `app.js` | 27202 | 27202 |
| componentDefectPreset | `app.js` | 30190 | 30190 |
| getDefectTypePresetFor | `app.js` | 30443 | 30443 |
| getDefectTypePresetForRaw | `app.js` | 30450 | 30450 |
| categoryDefectPreset | `app.js` | 30517 | 30517 |
| getCrackKindsForComponent | `app.js` | 30262 | 30262 |
| DEFECT_CAUSE_MAP | `app.js` | 32683 | 32683 |
| CRACK_CAUSE_BY_MEMBER | `app.js` | 32724 | 32724 |
| DEFECT_CAUSE_BY_MEMBER | `app.js` | 32781 | 32781 |
| defectCausePreset | `app.js` | 32817 | 32817 |
| getCauseMemberGroup | `app.js` | 32993 | 32993 |
| FINISH_TOP_CAUSES | `app.js` | 33066 | 33066 |
| CRACK_TOP_CAUSES | `app.js` | 33049 | 33049 |
| LEAK_TOP_CAUSES | `app.js` | 33088 | 33088 |
| COMPANY_CAUSE_RANK | `app.js` | 33034 | 33034 |
| DEFECT_CAUSE_ALLOW | `app.js` | 33145 | 33145 |
| getDefaultCausePresetList | `app.js` | 33152 | 33175 |
| getDefaultCausePresetListRaw | `app.js` | 33166 | 33189 |
| shouldDropIncompatibleCause | `app.js` | — | 33163 |
| filterIncompatibleDefaultCauses | `app.js` | — | 33171 |
| company-vocab | `js/core/company-vocab.js` | — | — |
| defect-quick-presets | `js/shared/defect-quick-presets.js` | — | — |
| extract-harness | `scripts/test-defect-cause-mapping.js` | — | — |

## 관계를 만드는 방식 (교차곱 금지)

1. 대분류는 코드 순서 그대로: 구조체 → 비구조체 → 마감재.
2. 부재는 그 분류의 `DEFECT_COMPONENT_PRESET[분류]` 배열 순서만. 다른 분류 부재를 섞지 않음.
3. 결함내용은 `getDefectTypePresetFor(분류, 부재)`가 돌려 준 배열만. 허용 목록(`DEFECT_TYPE_ALLOW`)으로 걸러서 비면 걸러내기 전 목록.
4. 원인은 `getCauseDisplayGroups(결함내용)`의 키마다 `getDefaultCausePresetList(key, types, 분류, 부재)`.
5. 같은 바탕 부재 이름(벽체·기둥·보·슬래브·바닥)도 **분류가 다르면 결함 목록이 다름** — 한 표로 합치지 말 것.
6. 마감재 `FINISH_TOP_CAUSES`(시공미흡, 경과년수 증대에 따른 노후화, 상부 배관 누수, 상부 누수)는 **마감재 분류 공통 전치**(미장균열·백태류 제외). 부재마다 새로 만든 관계가 아님. JSON에서 `kind: category-wide`, `shared: true`.
7. 균열 `CRACK_TOP_CAUSES`·누수 `LEAK_TOP_CAUSES`는 **그 결함 가족만**. 다른 종류에 펼치지 말 것.
8. 균열 방향별 원인은 `CRACK_CAUSE_BY_MEMBER[부재군][방향]`. 그 방향 키가 없으면 `"*"`.
9. `DEFECT_CAUSE_BY_MEMBER`에 없는 (종류, 부재군)은 `defectCausePreset[종류]` 타입 기본값.
10. `componentDefectPreset`의 칩 밖 키(창호·문·철골기둥 …)는 직접 입력/예전 이름 경로. 칩 트리에 끼워 넣지 않음 — `typedOrLegacyMemberRoutes`.
11. 접합부 좌·우 목록(`DEFECT_JOINT_LEFT` × `DEFECT_JOINT_RIGHT`)은 작곡기이지 기본 칩 행이 아님.

## 배포 기준 칩 부재 (원 라벨·순서)

- **구조체**: 1. 기둥 · 2. 보(G) · 3. 보(B) · 4. 철골보(G) · 5. 철골보(B) · 6. 슬래브 · 7. 벽체 · 8. RC벽체 · 9. 계단 · 10. 옹벽 · 11. 기타
- **비구조체**: 1. 벽체 · 2. 조적벽체 · 3. 바닥 · 4. 파라펫 · 5. 기둥 · 6. 부대시설 · 7. 벽체 접합부 · 8. 난간 · 9. 슬래브 · 10. RC벽체 · 11. 치장벽돌 · 12. 옹벽 · 13. 계단 · 14. 보(G) · 15. 보(B) · 16. 배수로 · 17. 바닥 포장 · 18. 기타
- **마감재**: 1. 천장 마감재 · 2. 벽체 타일 · 3. 벽체 · 4. 기둥 · 5. 보(G) · 6. 보(B) · 7. 슬래브 · 8. 바닥 · 9. 지붕 마감재 · 10. 타일 마감재 · 11. 기둥 미장 · 12. 기타

- 접합부 작곡 프리셋(칩 아님, 구조체만 시험 경로와 동일): 기둥-보 접합부, 벽체-슬래브 접합부

## company-vocab 보충 규칙 (칩 트리 아님)

- 파일: `js/core/company-vocab.js` (READ ONLY, 배포/제안 커밋 동일)
- 표준 원인: 시공미흡, 개구부 주위 응력집중, 주변부재의 구속, 건조수축 및 재료적 특성, 경과년수 증대에 따른 노후화, 이질재료 접합부 거동차이, 관리미흡
- 별칭:
  - 개구부응력집중 → 개구부 주위 응력집중
  - 개구부주변응력집중 → 개구부 주위 응력집중
  - 개구부주위의응력집중 → 개구부 주위 응력집중
  - 주변부재구속 → 주변부재의 구속
  - 주변부재에의한구속 → 주변부재의 구속
  - 경과년수증대로인한노후화 → 경과년수 증대에 따른 노후화
  - 경과년수에따른노후화 → 경과년수 증대에 따른 노후화
  - 이질재료접합부거동차 → 이질재료 접합부 거동차이
- 규칙:
  - 구조체 행은 부재/조사내용을 쪼개지 않음(원인 표기 통일만).
  - 비구조체·마감재만 splitSurveyContent + combineMember.
  - 저장된 결함은 고치지 않음.
  - CAUSE_STANDARD / CAUSE_ALIASES는 가져온 원인 문자열 정규화. 새 칩 원인을 추가하지 않음.

## 사용자 커스텀 프리셋

**unavailable** — 계정 커스텀(customDefectTypes / customDefectCauses / customDefectComponents / hidden* / defectPinPresets)은 회사 Firestore와 기기 localStorage에만 있다. 이 저장소에는 없고, Firebase 실데이터는 읽지 않았다.

## t571u 제외 연관 (미배포)

- 상태: **unreleased**
- 제안 커밋: `deea9059a55910db2e63f4b353a418ba26e03d97`
- PR: https://github.com/dongil2010/building-safety-app/pull/36
- 배포본에는 아직 그대로 보임. 저장된 결함·커스텀·Firebase는 변경 없음. company-vocab.js 미수정.
- 제외 건수(칩+접합부 작곡 조합): **254**
- (분류, 원인키, 원인) 묶음: **24**

| reasonCode | count |
|---|---:|
| structural-only-on-nonstructure | 138 |
| moisture-pipe-on-dry-finish | 116 |

묶음 목록 (부재·종류는 JSON 전체 행을 볼 것):

- [마감재] 균열 ↛ 상부 누수 (moisture-pipe-on-dry-finish) — 부재 11개, 종류 1개
- [마감재] 균열 ↛ 상부 배관 누수 (moisture-pipe-on-dry-finish) — 부재 11개, 종류 1개
- [마감재] 균열 ↛ 철근 부식 팽창 (structural-only-on-nonstructure) — 부재 6개, 종류 1개
- [마감재] 기타 ↛ 상부 누수 (moisture-pipe-on-dry-finish) — 부재 12개, 종류 1개
- [마감재] 기타 ↛ 상부 배관 누수 (moisture-pipe-on-dry-finish) — 부재 12개, 종류 1개
- [마감재] 도장열화 ↛ 상부 누수 (moisture-pipe-on-dry-finish) — 부재 7개, 종류 1개
- [마감재] 도장열화 ↛ 상부 배관 누수 (moisture-pipe-on-dry-finish) — 부재 7개, 종류 1개
- [마감재] 박락 ↛ 철근 부식 팽창 (structural-only-on-nonstructure) — 부재 11개, 종류 1개
- [마감재] 이격 ↛ 상부 누수 (moisture-pipe-on-dry-finish) — 부재 9개, 종류 1개
- [마감재] 이격 ↛ 상부 배관 누수 (moisture-pipe-on-dry-finish) — 부재 9개, 종류 1개
- [마감재] 철근노출 ↛ 상부 누수 (moisture-pipe-on-dry-finish) — 부재 7개, 종류 1개
- [마감재] 철근노출 ↛ 상부 배관 누수 (moisture-pipe-on-dry-finish) — 부재 7개, 종류 1개
- [마감재] 철근노출 ↛ 철근 부식 팽창 (structural-only-on-nonstructure) — 부재 7개, 종류 1개
- [마감재] 철근노출 ↛ 피복두께 부족 (structural-only-on-nonstructure) — 부재 7개, 종류 1개
- [마감재] 파손 ↛ 상부 누수 (moisture-pipe-on-dry-finish) — 부재 12개, 종류 1개
- [마감재] 파손 ↛ 상부 배관 누수 (moisture-pipe-on-dry-finish) — 부재 12개, 종류 1개
- [비구조체] 균열 ↛ 내력부족 (structural-only-on-nonstructure) — 부재 18개, 종류 6개
- [비구조체] 균열 ↛ 철근 부식 팽창 (structural-only-on-nonstructure) — 부재 7개, 종류 4개
- [비구조체] 미장균열 ↛ 내력부족 (structural-only-on-nonstructure) — 부재 9개, 종류 1개
- [비구조체] 철근노출 ↛ 철근 부식 팽창 (structural-only-on-nonstructure) — 부재 7개, 종류 1개
- [비구조체] 철근노출 ↛ 피복두께 부족 (structural-only-on-nonstructure) — 부재 7개, 종류 1개
- [비구조체] 콘크리트 박락 ↛ 철근 부식 팽창 (structural-only-on-nonstructure) — 부재 7개, 종류 1개
- [비구조체] 콘크리트 박리 ↛ 철근 부식 팽창 (structural-only-on-nonstructure) — 부재 7개, 종류 1개
- [비구조체] 콘크리트 박리 ↛ 피복두께 부족 (structural-only-on-nonstructure) — 부재 7개, 종류 1개

## 관련 작업 상태

- **t568u** [deployed]: 회차선택에 현장 담당자/연락처(inspector·contactPhone, 없으면 미등록). t570u로 main 배포.
- **t569u** [deployed]: 직접입력 「프리셋에 저장」/「이번만 사용」 토글. 기기 localStorage. t570u로 main 배포.
- **t570u** [deployed]: main c3f9122. 구현 a246cab, 버전 토큰 20261106_112232, live web-version short c3f9122.
- **t571u** [unreleased]: 원인 매핑 정리 PR #36, deea905. 배포하지 않음. 이 추출의 proposed/removed 섹션.
- **t572u** [source-export-only]: 프리셋 트리 소스 JSON+노트. XLSX 없음.

## 통계

- 원인 그룹 조합 수(상태양호 제외): 472
- 배포본과 제안본이 다른 그룹: 149

