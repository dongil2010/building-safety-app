"""SafetyMan .sfm 작성 도구.

  py -3 sfm_tool.py new   양식.xlsx [표본층 수]     빈 작성 양식 만들기
  py -3 sfm_tool.py xlsx  원본.sfm  수정용.xlsx     기존 .sfm 을 엑셀로 풀기
  py -3 sfm_tool.py sfm   작성.xlsx 결과.sfm        엑셀 양식 → SafetyMan 에서 여는 .sfm
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openpyxl
import sfm_format as F
import sfm_excel as X


def main(argv):
    if len(argv) < 3:
        print(__doc__); return 2
    cmd = argv[1]
    if cmd == "new":
        n = int(argv[3]) if len(argv) > 3 else 3
        X.to_workbook(X.blank_doc(n)).save(argv[2])
        print(f"빈 양식 저장: {argv[2]} (표본층 {n}개 — 시트를 복사해 늘릴 수 있음: 이름은 표본층4, 표본층5 …)")
    elif cmd == "xlsx":
        doc = F.read(open(argv[2], "rb").read())
        X.to_workbook(doc).save(argv[3])
        print(f"엑셀 저장: {argv[3]} (표본층 {len(doc['floors'])}개)")
    elif cmd == "sfm":
        doc = X.from_workbook(openpyxl.load_workbook(argv[2], data_only=True))
        data = F.write(doc)
        F.read(data)  # 다시 읽어 형식 확인
        open(argv[3], "wb").write(data)
        print(f".sfm 저장: {argv[3]} ({len(data)}바이트, 표본층 {len(doc['floors'])}개)")
    else:
        print(__doc__); return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
