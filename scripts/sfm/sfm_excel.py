"""SafetyMan .sfm ↔ 엑셀 작성 양식.

  건물      시트 1개: 항목 | 값 | (키)
  표본층N   시트 N개: 층 정보 + [블록] 들
     목록 블록  (콘크리트강도·탄산화·염화물·내력비·강재규격·내화피복)
                한 줄 = 평가부재 1개: 부재 | 값1 | 값2 | 값3 | 값4 | 손상여부
     표 블록    (균열·박리·박락·누수·철근노출·철근부식·용접·볼트·강재부식·접합재부식)
                행 = 등급/구간, 열 = 부재.  부재 열이 전부 비어 있으면 '자료 없음'
  강도·내력은 화면 단위(× 0.009806)로 보이고, 저장할 때 ÷ 0.009806 (SafetyMan 과 같은 계산 → 비트 동일)
"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
import sfm_format as F

KGF = 0.009805999999999999
M7 = ["기둥", "내력벽", "슬래브", "테두리보(칸3)", "접합부(칸4)", "큰보", "작은보"]
M3 = ["기둥(강재)", "큰보(강재)", "작은보(강재)"]
M5 = ["기둥이음부", "보이음부", "기둥/보 접합부", "보/보 접합부", "주각 접합부"]
FRAME = {0: "벽식", 1: "라멘", 2: "무량판"}
MATERIAL = {0: "RC", 1: "SRC", 2: "강구조"}

GR = ["a", "b", "c", "d", "e"]
ENV = ["건조환경", "습윤환경", "부식성환경", "고부식성환경"]
# 섹션 이름 → (시트 제목, 부재 목록, 목록이면 값 열 이름 / 표면 행 이름, 힘 단위 환산 여부)
LIST_BLOCKS = {
    "strength":     ("콘크리트강도 (측정강도 / 설계강도)", M7, ["측정1", "측정2", "측정3", "설계강도", "손상여부"], True),
    "carbonation":  ("콘크리트 탄산화 (깊이 / 피복두께, cm)", M7, ["깊이1", "깊이2", "깊이3", "피복두께"], False),
    "chloride":     ("염화물 함유량 (kg/㎥)", M7, ["측정1", "측정2", "측정3"], False),
    "member_ratio": ("부재 내력비 (저장값 그대로)", M7, ["값1", "값2", "손상여부", "값4"], False),
    "joint_ratio":  ("접합부 내력비 (저장값 그대로)", M5, ["값1", "값2", "손상여부", "값4"], False),
    "steel_spec":   ("강재 규격 (저장값 그대로)", M3, ["값1", "값2"], False),
    "fire_cover":   ("내화피복 (mm, 저장값 그대로)", M3, ["값1", "값2", "손상여부"], False),
}
TABLE_BLOCKS = {
    "crack":      ("콘크리트 균열", M7, ["0.1mm미만", "0.2mm미만", "0.3mm미만", "0.5mm미만", "0.5mm이상", "면적율20%미만", "면적율20%이상"]),
    "scaling":    ("박리", M7, ["발생없음", "0.5mm미만", "1.0mm미만", "2.5mm미만", "2.5mm이상", "면적율10%미만", "면적율10%이상"]),
    "spalling":   ("박락·층분리", M7, ["발생없음", "15mm미만", "20mm미만", "25mm미만", "25mm이상", "면적율20%미만", "면적율20%이상"]),
    "leakage":    ("누수·백태", M7, ["발생없음", "경미(5%미만)", "현저(10%미만)", "관찰(20%미만)", "확연(20%이상)"]),
    "rebar_expo": ("철근노출", M7, ["노출없음", "1%미만", "3%미만", "5%미만", "5%이상"]),
    "rebar_corr": ("철근부식 (추정: 부식상태 a~e + 부식환경)", M7, [f"부식상태 {g}" for g in GR] + ENV),
    "weld":       ("용접 접합상태", M3, [f"{g}등급" for g in GR]),
    "bolt":       ("볼트 접합상태", M3, ["결함 접합부 수(누락·이완·풀림)", "조사한 접합부 수"]),
    "steel_corr": ("강재 부식도", M3, [f"{g}등급" for g in GR]),
    "joint_corr": ("접합재 부식 (용접·볼트)", M3, [f"용접 {g}" for g in GR] + [f"용접 {e}" for e in ENV]
                   + [f"볼트 {g}" for g in GR] + [f"볼트 {e}" for e in ENV]),
}
BUILDING_LABELS = {
    "name": "건물명", "address": "소재지", "completion_year": "준공년도", "completion_month": "준공월",
    "use": "주용도", "image": "이미지 경로", "structure": "구조형식", "floors_above": "지상 층수",
    "floors_below": "지하 층수", "site_area": "대지면적(㎡)", "building_area": "건축면적(㎡)",
    "total_floor_area": "건축연면적(㎡)", "coverage_ratio": "건폐율", "floor_area_ratio": "용적율",
    "owner": "소유주", "owner_tel": "소유주 연락처", "manager": "관리주체", "manager_tel": "관리주체 연락처",
    "agency": "평가기관", "agency_tel": "평가기관 연락처", "eval_datetime": "평가일시 (예: 2026-10-5 15:6)",
}
for k, lab in enumerate(F.MIN_RANGE_LABELS):
    BUILDING_LABELS[f"min_range_{k:02d}"] = f"최소범위 · {lab} (추정)"

HEAD = PatternFill("solid", fgColor="DDE7F3")
BOLD = Font(bold=True)


EXACT_COL = 12   # 목록 블록: 엑셀이 double 끝자리를 자르는 값의 원래 비트(float.hex)를 숨겨 둔다


def _shown(x):
    """엑셀 셀에 저장됐다 읽혔을 때의 값 (15자리 유효숫자)."""
    return float(format(x, ".15g"))


def _num(v, as_int=False):
    if v is None or v == "":
        return 0 if as_int else 0.0
    return int(round(float(v))) if as_int else float(v)


# ───────────────────────── sfm → 엑셀 ─────────────────────────
def to_workbook(doc):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "건물"
    ws.append(["항목", "값", "키 (수정하지 마세요)"])
    for c in ws[1]:
        c.font, c.fill = BOLD, HEAD
    ws.append(["파일 버전", doc["version"], "version"])
    for key, t in F.BUILDING:
        ws.append([BUILDING_LABELS.get(key, key), doc["building"][key], key])
    ws.column_dimensions["A"].width, ws.column_dimensions["B"].width, ws.column_dimensions["C"].width = 34, 46, 22
    for i, fl in enumerate(doc["floors"], 1):
        _floor_sheet(wb.create_sheet(f"표본층{i}"), fl)
    return wb


def _floor_sheet(ws, fl):
    r = 1
    ws.cell(r, 1, "층 정보").font = BOLD
    rows = [("범위 시작층", fl["range_from"]), ("범위 끝층", fl["range_to"]), ("표본층", fl["sample_floor"]),
            ("구조형식 (벽식/라멘/무량판)", FRAME.get(fl["frame"], fl["frame"])),
            ("구조재료 (RC/SRC/강구조)", MATERIAL.get(fl["material"], fl["material"]))]
    for lab, v in rows:
        r += 1
        ws.cell(r, 1, lab); ws.cell(r, 2, v)
    for name, (title, members, cols, conv) in LIST_BLOCKS.items():
        r += 2
        ws.cell(r, 1, f"[{title}]").font = BOLD
        ws.cell(r, 1).fill = HEAD
        ws.cell(r, 10, name)  # 블록 키
        r += 1
        for j, h in enumerate(["부재"] + cols, 1):
            ws.cell(r, j, h).font = BOLD
        fmt = F.ITEMS[dict((s[0], s[3]) for s in F.SECTIONS)[name]]
        for m, cell in zip(members, fl[name]):
            for rec in cell:
                r += 1
                ws.cell(r, 1, m)
                exact = []
                for j, (t, v) in enumerate(zip(fmt, rec), 2):
                    shown = v * KGF if conv and t == "d" else v
                    ws.cell(r, j, shown)
                    back = (_shown(shown) / KGF if conv else _shown(shown)) if t == "d" and shown else v
                    exact.append(v.hex() if t == "d" and back != v else "")
                if any(exact):
                    c = ws.cell(r, EXACT_COL, "|".join(exact))
                    c.font = Font(color="BBBBBB", size=8)
        r += 1
        ws.cell(r, 1, "(끝)")
    for name, (title, members, labels) in TABLE_BLOCKS.items():
        r += 2
        ws.cell(r, 1, f"[{title}]").font = BOLD
        ws.cell(r, 1).fill = HEAD
        ws.cell(r, 10, name)
        r += 1
        ws.cell(r, 1, "구분").font = BOLD
        for j, m in enumerate(members, 2):
            ws.cell(r, j, m).font = BOLD
        for k, lab in enumerate(labels):
            r += 1
            ws.cell(r, 1, lab)
            for j, cell in enumerate(fl[name], 2):
                if cell is not None:
                    ws.cell(r, j, cell[k])
    r += 2
    ws.cell(r, 1, "[메모 14칸]").font = BOLD
    ws.cell(r, 1).fill = HEAD
    ws.cell(r, 10, "memos")
    for k, s in enumerate(fl["memos"]):
        r += 1
        ws.cell(r, 1, f"메모{k + 1}"); ws.cell(r, 2, s)
    ws.column_dimensions["A"].width = 30
    for col in "BCDEFGH":
        ws.column_dimensions[col].width = 14


# ───────────────────────── 엑셀 → sfm ─────────────────────────
def from_workbook(wb):
    ws = wb["건물"]
    doc = {"version": 1.1, "building": {}, "floors": []}
    types = dict(F.BUILDING)
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or row[2] is None:
            continue
        key, v = row[2], row[1]
        if key == "version":
            doc["version"] = float(v)
        elif key in types:
            t = types[key]
            doc["building"][key] = ("" if v is None else str(v)) if t == "s" else _num(v, t == "i")
    for key, t in F.BUILDING:
        doc["building"].setdefault(key, "" if t == "s" else (0 if t == "i" else 0.0))
    sheets = sorted([s for s in wb.sheetnames if s.startswith("표본층")], key=lambda s: int(s[3:] or 0))
    for s in sheets:
        doc["floors"].append(_read_floor(wb[s]))
    return doc


def _code(v, table):
    if isinstance(v, (int, float)):
        return int(v)
    inv = {name: k for k, name in table.items()}
    if v not in inv:
        raise ValueError(f"알 수 없는 값 {v!r} (가능: {list(inv)})")
    return inv[v]


def _read_floor(ws):
    cells = {(c.row, c.column): c.value for row in ws.iter_rows() for c in row if c.value is not None}
    maxr = ws.max_row
    v = lambda r, c: cells.get((r, c))
    fl = {"range_from": _num(v(2, 2), True), "range_to": _num(v(3, 2), True),
          "sample_floor": _num(v(4, 2), True), "frame": _code(v(5, 2), FRAME), "material": _code(v(6, 2), MATERIAL)}
    starts = {v(r, 10): r for r in range(1, maxr + 1) if isinstance(v(r, 10), str)}
    sect = {s[0]: s for s in F.SECTIONS}
    for name, (title, members, cols, conv) in LIST_BLOCKS.items():
        fmt = F.ITEMS[sect[name][3]]
        out = [[] for _ in members]
        r = starts[name] + 2
        while r <= maxr and v(r, 1) not in ("(끝)", None):
            m = v(r, 1)
            if m not in members:
                raise ValueError(f"{ws.title} [{title}] {r}행: 부재 이름 {m!r} 이 목록에 없음 {members}")
            rec = []
            hx = str(v(r, EXACT_COL) or "").split("|")
            for j, t in enumerate(fmt, 2):
                x = _num(v(r, j), t == "i")
                val = x / KGF if conv and t == "d" and x else x
                h = hx[j - 2] if j - 2 < len(hx) else ""
                if t == "d" and h:
                    orig = float.fromhex(h)
                    if _shown(orig * KGF if conv else orig) == _shown(x):  # 사용자가 안 고친 값 → 원래 비트
                        val = orig
                rec.append(val)
            out[members.index(m)].append(rec)
            r += 1
        fl[name] = out
    for name, (title, members, labels) in TABLE_BLOCKS.items():
        r0 = starts[name] + 2
        out = []
        for j in range(2, 2 + len(members)):
            col = [v(r0 + k, j) for k in range(len(labels))]
            out.append(None if all(x is None for x in col) else [_num(x, True) for x in col])
        fl[name] = out
    r0 = starts["memos"] + 1
    fl["memos"] = [("" if v(r0 + k, 2) is None else str(v(r0 + k, 2))) for k in range(F.FLOOR_MEMOS)]
    return fl


def blank_doc(n_floors=3):
    """빈 작성 양식용 문서: 표본층 n개, 모든 칸 비어 있음 (라멘·RC)."""
    b = {key: ("" if t == "s" else (0 if t == "i" else 0.0)) for key, t in F.BUILDING}
    for k in range(12):
        b[f"min_range_{k:02d}"] = 10.0 if k < 2 else 20.0
    floors = []
    for i in range(n_floors):
        fl = {"range_from": 0, "range_to": 0, "sample_floor": 0, "frame": 1, "material": 0,
              "memos": [""] * F.FLOOR_MEMOS}
        for name, kind, slots, item in F.SECTIONS:
            fl[name] = [[] for _ in range(slots)] if kind == "list" else [None] * slots
        floors.append(fl)
    return {"version": 1.1, "building": b, "floors": floors}
