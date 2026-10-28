"""SafetyMan(KISTEC 건축물 종합평가 시스템) .sfm 파일 읽기/쓰기.

SafetyMan.exe 의 MFC Serialize 함수를 디스어셈블해 그대로 옮긴 문법이다.
  문서   CSafetyManDoc::Serialize   0x409ca0  double 버전(1.1) + 건물
  건물   0x454f80                   문자열·정수·면적·평가정보 + 표본층 목록
  표본층 0x45c750                   정수 5개 + 메모 문자열 14개 + 항목 17개(0x45cb80 …)
  항목 객체 Serialize               0x466f60, 0x455f00, 0x455cc0, 0x455af0, 0x4678c0, 0x4561e0,
                                    0x4671d0, 0x467590, 0x468130, 0x467f80, 0x466b00

모든 정수는 int32, 실수는 double(리틀엔디언). 문자열은 MFC CString(길이 1바이트, 255 이상이면
0xFF+WORD / 0xFF FFFF+DWORD) + CP949 바이트.
강도·내력 같은 힘 단위 값은 kgf 로 저장된다(화면 값 × 1/0.009806).

read(bytes) → dict,  write(dict) → bytes.  read 후 write 하면 원본과 바이트가 같아야 한다.
"""
import struct

# ── 항목 객체: 필드 형식 ('d' double, 'i' int32) ─────────────────────────────
ITEMS = {
    "ratio":    "ddid",    # 0x466f60 부재/접합부 내력비: 소요강도, 부재강도, 손상여부, ?
    "strength": "ddddi",   # 0x455f00 콘크리트강도: 측정1~3, 설계강도, 손상여부
    "carbon":   "dddd",    # 0x455cc0 탄산화: 깊이1~3, 피복두께
    "chloride": "ddd",     # 0x455af0 염화물: 측정1~3
    "steel":    "dd",      # 0x4678c0 강재 규격: 측정/설계
    "cover":    "ddi",     # 0x4561e0 피복 정보: 측정/설계, 손상여부
    "crack":    "i" * 9,   # 0x4671d0 균열
    "grade7":   "i" * 7,   # 0x467590 박리·박락·누수 등 (등급별 개수 + 면적율)
    "grade5":   "i" * 5,   # 0x468130 철근노출·부식 등 (등급별 개수)
    "pair":     "ii",      # 0x467f80
    "joint18":  "i" * 18,  # 0x466b00 접합부 부식 (exe 가 같은 필드를 두 번 쓰는 곳 포함, 그대로 18개)
}

# ── 표본층 항목 17개 (exe 호출 순서) ───────────────────────────────────────
#  kind: list = 칸마다 [int n][n × 항목],  opt = 칸마다 [int 0/1][(1이면) 항목]
#  부재 칸: 7칸 = 기둥, 내력벽, 슬래브, (칸3), (칸4), 큰보, 작은보 / 3칸 = 강재 기둥, 큰보, 작은보
#  (칸3·칸4 는 xlsx 표의 테두리보·접합부로 추정 — 샘플 파일에 값이 없어 미검증)
SECTIONS = [
    ("member_ratio", "list", 7, "ratio"),     # 0x45cb80 부재 내력비
    ("joint_ratio",  "list", 5, "ratio"),     # 0x45d0d0 접합부 내력비
    ("strength",     "list", 7, "strength"),  # 0x45d4e0 콘크리트강도
    ("carbonation",  "list", 7, "carbon"),    # 0x45da60 탄산화
    ("chloride",     "list", 7, "chloride"),  # 0x45dfe0 염화물
    ("steel_spec",   "list", 3, "steel"),     # 0x45e560 강재 규격
    ("fire_cover",   "list", 3, "cover"),     # 0x45e7f0 내화피복
    ("rebar_corr",   "opt",  7, "crack"),     # 0x45ea80 철근부식 (부식상태 5 + 부식환경 4, 추정)
    ("crack",        "opt",  7, "grade7"),    # 0x45f000 균열 (5구간 + 면적율 2)
    ("scaling",      "opt",  7, "grade7"),    # 0x45f580 박리 (발생없음+4구간 + 면적율 2)
    ("spalling",     "opt",  7, "grade7"),    # 0x45fb00 박락·층분리
    ("leakage",      "opt",  7, "grade5"),    # 0x460080 누수·백태
    ("rebar_expo",   "opt",  7, "grade5"),    # 0x460600 철근노출
    ("weld",         "opt",  3, "grade5"),    # 0x460b80 용접 접합상태 a~e
    ("bolt",         "opt",  3, "pair"),      # 0x460e20 볼트 접합상태 [결함 접합부 수, 조사 접합부 수]
    ("steel_corr",   "opt",  3, "grade5"),    # 0x4610c0 강재 부식도 a~e
    ("joint_corr",   "opt",  3, "joint18"),   # 0x461360 접합재 부식 (용접 5+4, 볼트 5+4)
]

# ── 건물(0x454f80) 저장 순서: (이름, 형식)  s=CString i=int32 d=double ────────
BUILDING = [
    ("name", "s"), ("address", "s"), ("completion_year", "s"), ("completion_month", "i"),
    ("use", "s"), ("image", "s"), ("structure", "s"),
    ("floors_above", "i"), ("floors_below", "i"),
    ("site_area", "d"), ("building_area", "d"), ("total_floor_area", "d"),
    ("coverage_ratio", "d"), ("floor_area_ratio", "d"),
    ("b_int50", "i"),
    ("owner", "s"), ("owner_tel", "s"), ("manager", "s"), ("manager_tel", "s"),
    ("b_int64", "i"),
    ("agency", "s"), ("agency_tel", "s"), ("eval_datetime", "s"),
    ("b_int88", "i"), ("b_int90", "i"), ("b_intb0", "i"),
    ("b_str8c", "s"),
] + [(f"min_range_{k:02d}", "d") for k in range(12)]
# min_range_00~11: 「안전성평가시 각 부재의 최소범위」 창 순서(기둥, 큰보, 내력벽, 테두리보, 작은보, 슬래브,
#   접합부, 기둥이음부, 보이음부, 기둥/보 접합부, 보/보 접합부, 주각 접합부)로 추정. 샘플은 모두 10,10,20…
MIN_RANGE_LABELS = ["기둥", "큰보", "내력벽", "테두리보", "작은보", "슬래브", "접합부",
                    "기둥이음부", "보이음부", "기둥/보 접합부", "보/보 접합부", "주각 접합부"]

# 표본층 정수: 범위 시작층, 범위 끝층, 표본층, 구조형식(0 벽식·1 라멘·2 무량판), 구조재료(0 RC·1 SRC·2 강구조)
FLOOR_INTS = ["range_from", "range_to", "sample_floor", "frame", "material"]
FLOOR_MEMOS = 14


class _R:
    def __init__(self, b):
        self.b, self.p = b, 0

    def take(self, fmt):
        v = struct.unpack_from("<" + fmt, self.b, self.p)
        self.p += struct.calcsize("<" + fmt)
        return v[0] if len(v) == 1 else list(v)

    def cstr(self):
        n = self.take("B")
        if n == 0xFF:
            n = self.take("H")
            if n == 0xFFFF:
                n = self.take("I")
        s = self.b[self.p:self.p + n]
        self.p += n
        return s.decode("cp949")


class _W:
    def __init__(self):
        self.out = bytearray()

    def put(self, fmt, *v):
        self.out += struct.pack("<" + fmt, *v)

    def cstr(self, s):
        raw = s.encode("cp949")
        n = len(raw)
        if n < 0xFF:
            self.put("B", n)
        elif n < 0xFFFF:
            self.put("BH", 0xFF, n)
        else:
            self.put("BHI", 0xFF, 0xFFFF, n)
        self.out += raw


def _read_val(r, t):
    return r.cstr() if t == "s" else r.take(t)


def _write_val(w, t, v):
    w.cstr(v) if t == "s" else w.put(t, v)


def read(data):
    r = _R(data)
    doc = {"version": r.take("d"), "building": {}, "floors": []}
    b = doc["building"]
    for key, t in BUILDING:
        b[key] = _read_val(r, t)
    nfloor = r.take("i")
    for _ in range(nfloor):
        fl = {k: r.take("i") for k in FLOOR_INTS}
        fl["memos"] = [r.cstr() for _ in range(FLOOR_MEMOS)]
        for name, kind, slots, item in SECTIONS:
            fmt = ITEMS[item]
            sec = []
            for _ in range(slots):
                if kind == "list":
                    n = r.take("i")
                    sec.append([r.take(fmt) for _ in range(n)])
                else:
                    flag = r.take("i")
                    sec.append(r.take(fmt) if flag else None)
            fl[name] = sec
        doc["floors"].append(fl)
    if r.p != len(data):
        raise ValueError(f"파일 끝에 {len(data) - r.p}바이트가 남음 (오프셋 {r.p})")
    return doc


def write(doc):
    w = _W()
    w.put("d", doc["version"])
    b = doc["building"]
    for key, t in BUILDING:
        _write_val(w, t, b[key])
    w.put("i", len(doc["floors"]))
    for fl in doc["floors"]:
        for k in FLOOR_INTS:
            w.put("i", fl[k])
        for s in fl["memos"]:
            w.cstr(s)
        for name, kind, slots, item in SECTIONS:
            fmt = ITEMS[item]
            sec = fl[name]
            assert len(sec) == slots, (name, len(sec))
            for cell in sec:
                if kind == "list":
                    w.put("i", len(cell))
                    for rec in cell:
                        w.put(fmt, *(rec if isinstance(rec, list) else [rec]))
                else:
                    if cell is None:
                        w.put("i", 0)
                    else:
                        w.put("i", 1)
                        w.put(fmt, *(cell if isinstance(cell, list) else [cell]))
    return bytes(w.out)


if __name__ == "__main__":
    import sys, json
    d = read(open(sys.argv[1], "rb").read())
    print(json.dumps(d, ensure_ascii=False, indent=1)[:4000])
