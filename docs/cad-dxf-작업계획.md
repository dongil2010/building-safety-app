# 캐드(DXF) 도면 작업 — 설계와 진행 상황

> 다음 세션에서 이어갈 때 이 파일만 읽으면 된다. 맨 아래 「진행 상황」을 먼저 본다.
> 브랜치: **`claude/dxf-vector-image-issue-d28c4d`** (워크트리 `.claude/worktrees/dxf-vector-image-issue-d28c4d`) — 2026-11-12 저녁부터 여기서 이어감.
> 처음 작업한 `claude/cad-engine-drawing-work-c6a615` 워크트리의 미커밋 변경을 그대로 복사해 왔다(그쪽은 더 고치지 않는다 — 옛 사본).
> 역할: 설계·검수 = Fable 5.2, 구현 = Opus 5.5(가져오기) + Sonnet 5.5(내보내기). 사용자 지시(2026-11-12).

## 사용자가 원한 것

1. **DXF 열기 + 벡터 화면** — 캐드 DXF를 층 도면으로 바로 올리고, 확대해도 선명하게 본다.
2. **마킹 DXF 내보내기** — 핀·지시선·박스·영역을 DXF로 내보내 캐드에서 바로 연다.

## 핵심 설계 결정

**DXF는 올릴 때 벡터 PDF로 바꿔서 지금 있는 「캐드 PDF」 경로에 태운다(저장·동기화·출력).**
**화면은 그 PDF 안의 선·글자 자료를 읽어 캔버스에 직접 그린다(화면 벡터 엔진, `js/core/dxf-view.js`).**

> 2026-11-12 사용자 지시: "레스터 말고 캐드 엔진이 들어가 있어야지". 처음 설계는 화면을 PDF에서 뽑은 그림(4000/8000/16000)으로
> 보여 줬는데, 한 파일에 도면 여러 장이 나란히 있는 실제 DXF(범위 0.5~1km)에서는 건물 하나에 수백 픽셀밖에 안 돌아가 확대하면
> 뭉개졌고, 고정 0.6점 선이 글자 높이의 절반만큼 뚱뚱해졌다. 그래서 화면 그리기만 엔진으로 바꿨다.

### 화면 벡터 엔진 (`js/core/dxf-view.js`, `BSA.dxfView`)

- 자료는 따로 저장하지 않는다. `dxf-to-pdf.js`가 PDF 스트림 사전에 표시를 달아 둔다:
  `/BSADxf /Paths`(쪽 내용 흐름 = 선·채움, m l h S f* w) · `/BSADxf /Texts`(글자 목록 JSON, 카탈로그 `/BSADxfTexts`).
  엔진은 PDF 날 바이트에서 이 스트림을 찾아 풀어(DecompressionStream) 모델을 만든다. → 서버·백업·다른 기기는 PDF 길 그대로.
- 표시가 없는 PDF(일반 캐드 PDF, **이 변경 전에 올린 DXF**)는 예전처럼 그림으로 보인다 → DXF를 다시 올려야 벡터로 보인다.
- 모델 읽기: `ensureFloorPlanRefForPdf`(app/01-base.js)가 층을 열 때 `BSA.dxfView.ensureModel(건물_층, pdfDataUrl)` 호출(뒤에서).
- 그리기: `drawFloorPlanLayers`(app/01-base.js) 맨 앞 — 화면 캔버스(`ctx === state.ctx`)이고 모델이 있으면
  `BSA.dxfView.drawOnCanvas(ctx, model, imgW, imgH, …)`. 지금 ctx 변환(확대·이동·회전)에 맞춰 보이는 부분만 그린다.
  선은 화면 1픽셀(글자 높이의 5%가 그보다 굵어지면 그 굵기), 글자는 진짜 글꼴(한글 포함), 2.5픽셀보다 작은 글자는 생략,
  화면에서 0.6픽셀보다 작은 객체는 점으로. 그린 결과는 화면 크기 캔버스 하나에 보관해 핀만 다시 그릴 때 재사용.
  한 번 그리는 데 28ms 넘는 무거운 도면은 움직이는 동안 방금 그림을 옮겨·늘려 보여 주고(밑에 래스터) 멈춘 뒤 90ms에 다시 그린다.
- DXF 층은 확대 한계가 맞춤의 1000배(일반 50배), 확대용 큰 그림(8000/16000)을 받지 않는다(`scheduleFloorDrawingTierSync`).
- 끄기(문제 생기면): 콘솔에서 `BSA_PDF_VECTOR.dxfLiveView = false`.
- 그림 그대로인 곳: 비파괴 탭 도면, 보고서·한글·PDF 출력(벡터 PDF 출력은 원래 벡터), 썸네일.
- 선 굵기: `pickLineWidth` = 글자 높이 중앙값의 5%(0.02~0.35점), 글자 없으면 0.15점.

- 이유: PDF 경로가 이미 다 해 준다 — 원본 보관(`bldg.floorDrawingPdfs`), 4000/8000/16000 그림 + 화면 부분 고해상도,
  선 스냅(`js/pdf-vector-snap.js`), 축 자동 잡기, 벡터 PDF 출력, 서버 동기화·백업·보고서.
  `floorDrawingPdfs`는 코드 113곳에서 쓰여서, DXF 전용 저장 칸을 새로 만들면 동기화·백업·묘비까지 다 손대야 한다.
- 들어가는 문 하나: `window.prepareFloorDrawingUpload(file)` (`js/pdf-vector-bridge.js` 70줄). 여기서 `.dxf`면 PDF `File`로 바꾼 뒤 그대로 진행.
- **좌표 왕복**: 변환할 때 「PDF 점 ↔ DXF 실좌표」 변환값을 PDF 안(문서 정보 Keywords)에 `BSA-DXF:{json}`으로 적어 둔다.
  내보낼 때 이걸 읽어 마킹을 **원래 캐드 좌표 그대로** DXF에 쓴다 → 캐드에서 원본 도면 위에 그대로 겹친다.

### 모듈과 약속(계약)

| 파일 | 담당 | 내용 |
|---|---|---|
| `js/core/dxf-read.js` | Opus | 순수. DXF 글자 풀기(인코딩) → 파싱 → 펼치기(블록·호·곡선을 선분으로). `BSA.dxfRead` |
| `js/core/dxf-to-pdf.js` | Opus | 펼친 결과 → pdf-lib 벡터 PDF. 변환값 쓰기·읽기. `BSA.dxfToPdf` |
| `js/pdf-vector-bridge.js` 70~100줄 | Opus | `prepareFloorDrawingUpload`에 DXF 분기 |
| `index.html`, `app/02-buildings.js` 등 | Opus | 파일 고르기에 `.dxf` 허용, 스크립트 태그(전부), 내보내기 버튼 `btnExportMarkingDxf` |
| `js/core/dxf-write.js` | Sonnet | 순수. 마킹 계획 → R12 ASCII DXF 글자. `BSA.dxfWrite` |
| `js/dxf-marking-export.js` | Sonnet | 브라우저 연결. `window.exportCurrentFloorMarkingDxf()`, `window.exportMarkingDxfWithScopeChoice()` |
| `js/pdf-vector-bridge.js` 777~806줄 | Sonnet | 핀 계획 만들기를 `window.buildVectorPinPlansForDefects(defects, measureCtx)`로 뽑아 PDF·DXF가 같이 씀 |

**변환값(meta) 약속** — `BSA.dxfToPdf.readMetaFromPdfDataUrl(pdfDataUrl)` → `Promise<meta|null>`

```
meta = { v: 1, s, ox, oy, pageW, pageH, unit, src }
PDF 점 (px, py)  →  DXF 실좌표 ( px / s + ox ,  py / s + oy )
s = 도면 1단위당 PDF 점 수. 페이지는 회전 없음, 원점 (0,0), 크기 pageW×pageH(점).
unit = DXF $INSUNITS (4=mm, 없으면 0). src = 원본 파일 이름.
```

마킹 좌표(도면 그림 픽셀, 기준 크기 imgW×imgH) → PDF 점: `x_pt = ix * pageW/imgW`, `y_pt = pageH - iy * pageH/imgH`
(`exportFloorPlanVectorPdf`의 `imgToPdf`와 같다).

### DXF → PDF 그리기 규칙

- 모형 공간만(67=1 종이 공간 제외). 꺼짐·동결 레이어와 `Defpoints`는 뺀다.
- 선은 **검정 한 색**(캐드 흑백 출력처럼) — 빨강·파랑 마킹이 묻히지 않게. 굵기는 4000px 그림에서 약 1px.
- 영문·숫자 글자는 PDF 기본 글꼴(Helvetica) → 글자로 남아 축 번호 자동 잡기가 읽는다.
  한글 등 기본 글꼴에 없는 글자는 캔버스로 그려 투명 PNG로 박는다(글꼴 파일을 싣지 않기 위해).
- 멀리 떨어진 쓰레기 객체 때문에 도면이 점처럼 작아지지 않게 바깥 범위를 걸러 낸다.
- 지원: LINE, LWPOLYLINE(bulge·폭), POLYLINE/VERTEX, CIRCLE, ARC, ELLIPSE, SPLINE(근사), TEXT, MTEXT, INSERT(중첩·배열·ATTRIB),
  DIMENSION(익명 블록), LEADER, SOLID/TRACE, HATCH(솔리드 채움만 회색). 돌출 방향 (0,0,-1) 뒤집힘 처리.
- 못 여는 것: DWG, 바이너리 DXF → 「캐드에서 DXF(ASCII)로 저장」 안내.

### 마킹 DXF 쓰기 규칙

- R12(AC1009) ASCII, 줄바꿈 CRLF. 한글은 `\U+XXXX`로 적어 어느 캐드에서나 깨지지 않게. 글꼴 스타일 `BSA_KR` = `malgun.ttf`.
- 레이어(영문): `BSA_PIN_BOX`, `BSA_PIN_TEXT`, `BSA_LEADER`, `BSA_AREA`, `BSA_LEGEND`, `BSA_REF`. 색은 가장 가까운 ACI.
- DXF로 올린 층 → 원래 캐드 좌표. 일반 PDF 층 → 종이 mm(점×25.4/72), 왼쪽 아래 원점. 그림 층 → 픽셀 단위(y 뒤집음).
- 처음 화면(VPORT *ACTIVE)을 내용 전체에 맞춰 적는다 — 없으면 캐드가 원점 근처 빈 곳을 열어 「레이어만 있고 아무것도 없는」 것처럼 보인다(2026-11-12 사용자 보고).
- DXF로 올린 층은 원본 도면 선·글자도 `BSA_DRAWING` 레이어에 같이 넣는다(화면 벡터 모델에서, 원래 캐드 좌표). 원래 레이어·색은 없다(한 레이어, 흰색).
- 일반 PDF 층은 `BSA_PDF_SNAP.getDetectionData`의 선분을 `BSA_REF`에 같이 넣어 캐드에서 맞추기 쉽게(있을 때만).

## 일부러 뺀 것(다음 단계 후보)

- 올린 뒤 레이어 켜고 끄기(지금은 올릴 때 꺼짐·동결만 제외).
- 한 DXF 안에 여러 층이 나란히 있는 경우 자동 나누기(지금은 파일 하나 = 층 하나).
- 화면에 실치수(mm) 좌표·거리 재기.
- DWG 직접 열기(라이선스 문제).
- 패턴 해치(솔리드만 지원).

## 규칙(프로젝트)

- `app.js`는 자동 생성. `app/` 조각을 고치고 `node scripts/app-parts.js join`.
- 새 스크립트 태그의 `?v=`는 index.html의 지금 토큰을 그대로 복사(배포 스크립트가 맞춘다).
- 시험: `scripts/test-*.js`, `npm test`. 순수 모듈은 `module.exports` + `root.BSA.x` 둘 다(예: `js/core/cad-desktop-import.js`).
- 구현 에이전트는 git 커밋·stash·푸시를 하지 않는다.
- **main에 푸시하지 않는다(사용자 지시 2026-11-12).** 검수가 끝나면 로컬의 다른 폴더로 복사해 사용자가 직접 시험하고,
  사용자가 "진행"이라고 한 뒤에만 main 합치기·푸시를 한다. 이 기능에서는 CLAUDE.md의 「상시 동기화」보다 이 지시가 먼저다.
- 세션 컨텍스트가 150k를 넘으면 이 문서의 「진행 상황」을 고쳐 두고 다음 세션으로 넘긴다(최대 250k).

## 진행 상황

- [x] 2026-11-12 구조 파악, 설계 확정, 이 문서 작성
- [x] Opus: DXF 읽기 + PDF 변환 + 올리기 연결 + index.html — 2026-11-12 완료
- [x] Sonnet: DXF 쓰기 + 내보내기 연결 — 2026-11-12 완료. `node scripts/test-dxf-write.js` 통과.
      Fable이 R12 형식 두 곳 보완(STYLE 코드 4, 파일 끝 줄바꿈). 실제 캐드·브라우저에서는 아직 안 열어 봄.
      알아 둘 점: 원형 끝점은 테두리만(R12에 채움 없음), 빨강 `#ef4444`는 ACI 20(주황빛 빨강)으로 나감,
      참조선은 가로·세로 선만 최대 4만 개.
- [x] Fable 검수(2026-11-12): `npm test` 298개 통과. 브라우저(localhost:8000)에서 만든 DXF로 올리기 → 그림·한글 표시 →
      마킹 DXF 내보내기까지 확인, 캐드 좌표가 정확히 왕복(120000,60000 → 그대로). 실제 PDF 층(B1F)은 종이 mm + 참조선 9813개로 나옴.
      안 해 본 것: 건물 저장·서버 올리기까지의 전체 흐름, 실제 회사 DXF, 실제 캐드에서 열기, DXF 층에서 스냅·축 자동 잡기.
- [x] 시험 폴더 복사(2026-11-12): `C:\Users\dlawo\building-safety-app-dxf-test` (git 아님, android 제외).
      실험용 PC 프로그램: 그 안 `dist-electron\win-unpacked\스마트 안전점검 (실험용).exe` (설치 없이 실행, 실제 설치본과 따로).
      시험 폴더에서만 고친 것(저장소에는 없음): `package.json`(이름·appId·productName·target=dir), `electron/main.js`
      (배포 웹을 열지 않고 늘 내장 파일, 포트 47815 고정, 창 제목). 코드를 고치면 다시 복사·빌드해야 한다:
      `electron-builder.cmd --win dir --projectDir .` (main 체크아웃의 node_modules/.bin 것 사용).
      주의: 실험용도 같은 서버(Firebase) 자료를 쓴다 — 시험용 건물을 따로 만들어 시험.
- [x] 2026-11-12 사용자가 실제 DXF로 시험 → "벡터가 아니다"(확대하면 뭉개지고 선이 뚱뚱) → 화면 벡터 엔진 추가(위 절).
      `npm test` 299개 통과(`scripts/test-dxf-view.js` 추가). 브라우저에서 만든 여러 장짜리 DXF(8장, 1km)로 엔진 단독 확인:
      확대 시 1~3ms, 전체 보기 약 12ms, 글자·선 선명. **앱 화면 흐름(올리기→층 열기→확대)은 로그인해야 해서 에이전트가 직접 못 봄.**
- [x] 시험 폴더·실험용 프로그램(exe)·실험용 APK(`building-safety-app-dxf-test-apk`, 앱 ID .experimental, 내장 화면)에 엔진 반영
- [ ] 한 DXF에 여러 장이 있을 때 올릴 범위 고르기(핀 크기가 전체 범위 기준이라 건물이 작게 잡히면 핀이 상대적으로 커진다)
- [x] 2026-11-12 사용자가 실험용에서 확인 뒤 "PDF도 그대로 되면 정식으로 푸시" → 일반 PDF 올리기·표시 길 확인(브라우저) 후 커밋·main 푸시(배포)

에이전트가 끝났는지 모르겠으면 `git status`로 본다 — 새 파일 `js/core/dxf-read.js`, `js/core/dxf-to-pdf.js`,
`js/core/dxf-write.js`, `js/dxf-marking-export.js`, `scripts/test-dxf-*.js`가 있고 `npm test`가 통과하면 구현은 된 것이다.
