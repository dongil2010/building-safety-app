"""SafetyMan .sfm 결함 개수 표 파서 (신라스테이 3쌍 xlsx로 검증, 1680셀 전부 일치).

.sfm 은 고정 크기 레코드의 DWORD(4바이트 LE) 배열이다.
  - 결함 섹션 1개 = 부재 5열(기둥, 내력벽, 슬래브, 큰보, 작은보) × 행
  - 균열·박리·박락: 6행 (발생없음/첫 구간 … 면적율), 열 간격 [0, 32, 64, 104, 136]
  - 누수·철근노출: 5행 (발생없음 … 구간 4개, 면적율 행 없음), 열 간격 [0, 24, 48, 80, 104]
  - 섹션 간격: 균열 기준 +0 / 박리 +168 / 박락 +336 / 누수 +504 / 철근 +632
  - 층 블록 기준 오프셋(균열 섹션 시작): 1F 732, 4F 1894, 12F 3092, 20F 4290
    (층마다 블록 간격이 다르므로 층 블록 기준값은 바이트 검색으로 찾는다)
"""
import struct

SECTIONS = [
    # (이름, 기준 오프셋, 행 수)
    ("crack", 0, 6),
    ("spall", 168, 6),
    ("peel", 336, 6),
    ("leak", 504, 5),
    ("rebar", 632, 5),
]
COL6 = {"기둥": 0, "내력벽": 32, "슬래브": 64, "큰보": 104, "작은보": 136}
COL5 = {"기둥": 0, "내력벽": 24, "슬래브": 48, "큰보": 80, "작은보": 104}


def read_defect_tables(data: bytes, floor_base: int):
    """floor_base: 해당 층의 균열 섹션 시작 오프셋. 반환: {섹션: {부재: [행별 개수]}}"""
    out = {}
    for name, rel, rows in SECTIONS:
        cols = COL6 if rows == 6 else COL5
        base = floor_base + rel
        out[name] = {
            member: [struct.unpack_from("<I", data, base + off + 4 * r)[0] for r in range(rows)]
            for member, off in cols.items()
        }
    return out


if __name__ == "__main__":
    import sys
    path, base = sys.argv[1], int(sys.argv[2])
    with open(path, "rb") as f:
        print(read_defect_tables(f.read(), base))
