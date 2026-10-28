"""SafetyMan .sfm 측정값 목록 (콘크리트강도·탄산화) 파서.

부재마다 [int32 n] 뒤에 n개의 평가부재 레코드가 붙는다 (평가부재가 없는 부재는 n=0).
  - 콘크리트강도: 레코드 36바이트 = double 측정1·측정2·측정3·설계강도 + int32 손상여부.
    값은 kgf 단위로 저장되고, 화면·xlsx 값은 × 0.009806 (SafetyMan.exe 0x498730 환산 상수)
  - 탄산화: 레코드 32바이트 = double 깊이1·깊이2·깊이3·피복두께 (cm, 환산 없음, 손상여부 칸 없음)

층마다 위치가 달라서 고정 오프셋 대신 레코드 모양으로 찾는다.
검증: 세이프티맨 sfm/xlsx 6쌍, 강도 셀 57개 · 탄산화 셀 44개 전부 일치, 남는 레코드 없음.
"""
import struct

KGF = 0.009805999999999999


def _lists(data, ok, size):
    """[int32 n][n × size 바이트] 중 모든 레코드가 ok(값4개) 를 통과하는 목록의 레코드들."""
    found = {}
    for i in range(0, len(data) - 40):
        n = struct.unpack_from("<i", data, i)[0]
        if not 1 <= n <= 10:
            continue
        recs = []
        for k in range(n):
            j = i + 4 + size * k
            if j + size > len(data):
                break
            v = struct.unpack_from("<4d", data, j)
            if not all(x == x for x in v) or not ok(v):
                break
            recs.append((j, v, struct.unpack_from("<i", data, j + 32)[0] if size == 36 else None))
        if len(recs) == n:
            for r in recs:
                found.setdefault(r[0], r)
    return [found[k] for k in sorted(found)]


def strength_records(data):
    """[(오프셋, [측정1, 측정2, 측정3], 설계강도, 손상여부)] — xlsx 와 같은 단위(× 0.009806)."""
    def ok(v):
        des = v[3] * KGF
        return 10 <= des <= 80 and 5 <= v[0] * KGF <= 100 and all(0 <= x * KGF <= 120 for x in v[:3])
    return [(j, [x * KGF for x in v[:3]], v[3] * KGF, dmg) for j, v, dmg in _lists(data, ok, 36)]


def carbonation_records(data):
    """[(오프셋, [깊이1, 깊이2, 깊이3], 피복두께, None)] (cm)."""
    def ok(v):
        return v[3] in (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0) and 0 < v[0] < 20 \
            and all(0 <= x < 20 for x in v[:3])
    return [(j, list(v[:3]), v[3], dmg) for j, v, dmg in _lists(data, ok, 32)]


if __name__ == "__main__":
    import sys
    d = open(sys.argv[1], "rb").read()
    for name, fn in (("강도", strength_records), ("탄산화", carbonation_records)):
        print(name)
        for j, vals, ref, dmg in fn(d):
            print(f"  @{j}: {[round(x, 3) for x in vals]} / {round(ref, 3)}  손상={dmg}")
