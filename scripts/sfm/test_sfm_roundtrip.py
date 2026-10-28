"""세이프티맨 폴더의 .sfm 전부:
  1) read → write 가 원본과 바이트까지 같은지
  2) .sfm → 엑셀 양식 → .sfm 도 원본과 바이트까지 같은지"""
import glob, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openpyxl
import sfm_format
import sfm_excel

DIR = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\dlawo\세이프티맨"
bad = 0
for p in sorted(glob.glob(os.path.join(DIR, "*.sfm"))):
    raw = open(p, "rb").read()
    try:
        doc = sfm_format.read(raw)
        out = sfm_format.write(doc)
    except Exception as e:
        print(f"FAIL {os.path.basename(p)}: {e}")
        bad += 1
        continue
    same = out == raw
    with tempfile.TemporaryDirectory() as td:
        x = os.path.join(td, "t.xlsx")
        sfm_excel.to_workbook(doc).save(x)
        via = sfm_format.write(sfm_excel.from_workbook(openpyxl.load_workbook(x, data_only=True)))
    same_x = via == raw
    bad += (not same) + (not same_x)
    print(f"{'OK  ' if same else 'DIFF'} 직접  {'OK  ' if same_x else 'DIFF'} 엑셀경유  "
          f"{os.path.basename(p)}  {len(raw)}B  표본층 {len(doc['floors'])}개")
    if not same_x:
        k = next(i for i in range(min(len(via), len(raw))) if via[i] != raw[i]) if len(via) == len(raw) else None
        print(f"     길이 {len(via)} vs {len(raw)}, 첫 차이 {k}")
sys.exit(1 if bad else 0)
