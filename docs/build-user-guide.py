#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""현장용 쉬운 사용 설명 PDF. 실행: py docs/build-user-guide.py"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem,
    KeepTogether, HRFlowable, CondPageBreak,
)

pdfmetrics.registerFont(TTFont("Malgun", r"C:\Windows\Fonts\malgun.ttf"))
pdfmetrics.registerFont(TTFont("MalgunBold", r"C:\Windows\Fonts\malgunbd.ttf"))

INK = HexColor("#171717")
MUTED = HexColor("#525252")
LINE = HexColor("#e5e5e5")
BAND = HexColor("#f4f4f4")
ACCENT = HexColor("#2a2a2a")

title = ParagraphStyle(
    "title", fontName="MalgunBold", fontSize=22, leading=28,
    textColor=INK, alignment=TA_CENTER, spaceAfter=4,
)
subtitle = ParagraphStyle(
    "subtitle", fontName="Malgun", fontSize=11, leading=16,
    textColor=MUTED, alignment=TA_CENTER, spaceAfter=8,
)
h = ParagraphStyle(
    "h", fontName="MalgunBold", fontSize=14, leading=20,
    textColor=INK, spaceBefore=12, spaceAfter=6,
)
body = ParagraphStyle(
    "body", fontName="Malgun", fontSize=10.5, leading=16.5,
    textColor=INK, alignment=TA_JUSTIFY, spaceAfter=4,
)
step = ParagraphStyle(
    "step", fontName="Malgun", fontSize=10.5, leading=16,
    textColor=INK, leftIndent=4, spaceAfter=2,
)
tip = ParagraphStyle(
    "tip", fontName="Malgun", fontSize=10, leading=15,
    textColor=HexColor("#3f3f3f"), backColor=HexColor("#fffbeb"),
    borderPadding=6, spaceBefore=4, spaceAfter=8, leftIndent=2, rightIndent=2,
)
footer_style = ParagraphStyle(
    "footer", fontName="Malgun", fontSize=8, leading=10,
    textColor=MUTED, alignment=TA_CENTER,
)


def P(text, style=body):
    return Paragraph(text, style)


def bullets(items):
    flow = []
    for item in items:
        flow.append(ListItem(P(item, step), leftIndent=12, bulletColor=INK))
    return ListFlowable(
        flow, bulletType="bullet", start="•",
        leftIndent=14, bulletFontName="Malgun", bulletFontSize=10,
        spaceBefore=2, spaceAfter=6,
    )


def section(num, name, blocks):
    head = P(f"{num}. {name}", h)
    return KeepTogether([head] + blocks[:1]) if False else [head] + blocks


SECTIONS = []


def add(num, name, *blocks):
    SECTIONS.append((num, name, list(blocks)))


add(
    "1", "이 설명서",
    P("처음부터 끝까지 순서대로 읽으면 됩니다. 어려운 말은 쓰지 않았습니다."),
    P("화면 위쪽 이름을 그대로 적었습니다. 태블릿과 컴퓨터 둘 다 같은 화면입니다."),
)

add(
    "2", "처음 켜면",
    P("앱을 열면 로그인 창이 나옵니다. 계정이 있으면 <b>기존 계정 로그인</b>에서 이메일과 비밀번호를 넣고 <b>시스템 로그인 및 점검 시작</b>을 누릅니다."),
    P("비밀번호를 잊으면 아래 <b>비밀번호를 잊으셨나요?</b>를 누릅니다."),
)

add(
    "3", "새로 가입하기",
    P("위쪽 <b>신규 가입</b>을 누릅니다. 두 가지 중 하나를 고릅니다."),
    bullets([
        "<b>회사 대표로 신규 등록</b> — 우리 회사를 이 앱에 처음 만드는 사람입니다. 이름, 회사 이름, 이메일, 비밀번호(6글자 이상)를 적습니다.",
        "<b>점검자 계정 만들기</b> — 회사가 이미 있는 사람입니다. 이름, 이메일, 비밀번호만 만듭니다. 로그인하면 회사 이름을 검색해서 가입을 신청합니다.",
    ]),
    P("점검자로 신청하면 <b>가입 승인 대기중</b> 화면이 나옵니다. 회사 대표가 허락하기 전에는 건물을 열 수 없습니다. 대표는 홈 설정의 <b>가입 승인</b>에서 이름을 확인하고 허락합니다."),
    P("허락됐는지 보려면 <b>승인 여부 새로고침</b>을 누릅니다."),
)

add(
    "4", "홈 화면",
    P("로그인하면 홈입니다. 건물 목록이 보입니다. 위 검색창에 현장 이름이나 주소를 칠 수 있습니다."),
    P("건물을 누르면 위쪽에 메뉴가 생깁니다."),
    bullets([
        "<b>홈</b> — 건물 목록",
        "<b>결함위치도 작성</b> — 도면 위에 손상 위치 찍기",
        "<b>상태조사표</b> — 찍은 내용을 표로 보기·고치기",
        "<b>통계</b> — 층마다 손상이 몇 개인지",
        "<b>비파괴</b> — 장비로 잰 값 적기",
    ]),
    P("오른쪽 위 설정(톱니)에서 회사 이름 저장, <b>새로고침</b>, 지운 건물 <b>휴지통</b>, <b>휴대폰으로 촬영해서 바로 받기</b>를 엽니다."),
    P("화면 아래 <b>현장 추가하기</b>로 새 건물을 만듭니다."),
    P("인터넷이 되면 내가 고친 내용이 같은 회사 다른 태블릿에도 들어갑니다. 인터넷이 끊긴 채 일해도, 나중에 연결되면 올라갑니다.", tip),
)

add(
    "5", "건물 만들기",
    P("<b>현장 추가하기</b>를 누릅니다."),
    bullets([
        "<b>현장명</b>은 꼭 적습니다. 예: ○○아파트",
        "동이 하나면 <b>단일 건물</b>. 아파트처럼 동이 여러 개면 <b>여러 동</b>을 고르고 동 이름을 적습니다.",
        "주소, 담당자, 연락처, 층수, 점검 날짜를 적습니다.",
        "<b>시설물 종별</b>에서 1종, 2종, 3종 중 하나를 고릅니다. 이 선택에 따라 나중에 한글 파일 모양이 달라집니다.",
        "점검 종류, 년도, 상반기 또는 하반기를 고릅니다.",
    ]),
    P("같은 건물을 다음 번에 또 점검하면, 홈에서 그 건물을 연 뒤 <b>다음 회차 시작</b>을 누릅니다. 도면과 지난 손상은 남고, 지난 손상은 지난 회차로 표시됩니다."),
)

add(
    "6", "도면 넣기",
    P("건물을 만드는 창 아래에 <b>층별 도면 업로드</b>가 있습니다."),
    bullets([
        "일반 그림이면 <b>사진/이미지</b>를 누릅니다.",
        "캐드에서 만든 도면이면 <b>캐드 PDF</b>를 누릅니다. 가능하면 PDF를 넣는 편이 선이 선명합니다.",
        "파일 이름에 층이 있으면 그 층으로 붙습니다. 예: B1, 1F, 2F, 지하1.",
        "미리보기에서 층이 틀리면 그 파일의 층을 바꿔 주세요.",
        "같은 층에 파일을 두 개 넣으면 마지막 파일만 남습니다.",
    ]),
    P("다 고르면 <b>건축물 등록 완료</b>를 누릅니다."),
    P("이미 있는 건물에 도면을 더 넣거나 바꾸려면, 홈에서 그 건물의 수정을 열고 같은 자리에 새 파일을 넣습니다. 같은 층에 새 PDF를 넣고 저장이 끝나면, 다른 태블릿은 그 층을 다시 열 때 새 도면으로 바뀝니다. 그 태블릿도 홈 <b>새로고침</b>을 한 번 한 뒤여야 합니다.", tip),
    P("위쪽 <b>점검 층</b>에서 지금 볼 층을 고릅니다. 도면이 없다고 나오면, 그 층에 파일을 넣었는지와 층 선택이 맞는지 확인합니다."),
)

add(
    "7", "손상 위치 찍기",
    P("<b>결함위치도 작성</b>으로 갑니다. 위 버튼에서 방법을 고릅니다."),
    bullets([
        "<b>핀 마킹</b> — 점 하나. 손상 위치를 누르면 번호 상자와 화살표가 생기고 입력 창이 열립니다. 화살표 끝은 손상 위에, 번호 상자는 빈 곳으로 옮깁니다.",
        "<b>영역 마킹</b> — 넓은 면. 박스, 타원, 다각형 중 하나를 고릅니다. 다각형은 모서리를 하나씩 찍고, 처음 점 근처를 다시 누르거나 완료를 누르면 닫힙니다.",
        "<b>선택</b> — 이미 찍은 것을 고릅니다. 빈 곳을 끌면 도면이 움직입니다. 두 손가락으로 벌리면 커지고, 오므리면 작아집니다.",
    ]),
    P("찍은 핀을 옮기려면 선택 모드에서 번호 상자나 화살표 끝을 끕니다. 태블릿은 0.3초쯤 누른 뒤 끌면 움직입니다."),
    P("입력 창에 적을 것: 어디인지(위치), 기둥·보·벽 같은 부재, 무슨 손상인지, 폭·길이·개수, 원인. 적는 즉시 저장됩니다. 창을 닫아도 됩니다."),
    bullets([
        "<b>중요</b> 또는 <b>중점관리</b>를 켜면 번호 상자 왼쪽 위에 노란 원이 붙습니다. 상자 색 자체는 그대로입니다. 중점관리는 상자 색이 초록으로 바뀝니다.",
        "<b>진행중</b>, <b>누수</b>, <b>전회차</b>(지난 점검에 있던 것)도 필요하면 켭니다.",
        "여러 개를 한 번호로 묶으려면 핀을 여러 개 고른 뒤 통합을 씁니다. 풀려면 통합 해제를 씁니다.",
    ]),
    P("왼쪽 목록에서 번호를 누르면 그 위치로 갑니다. 목록이 거슬리면 <b>목록</b> 버튼으로 껐다 켭니다."),
)

add(
    "8", "사진 넣기",
    P("손상 입력 창 위쪽에 사진 칸이 있습니다."),
    bullets([
        "<b>현차</b>가 이번 점검 사진입니다. <b>촬영</b>은 지금 카메라, <b>추가</b>는 이미 찍어 둔 사진입니다. 여러 장 넣을 수 있습니다.",
        "<b>전차</b>는 지난 점검 사진입니다. 여기서 새로 찍지 않습니다. 지난 자료를 가져오거나 다음 회차로 넘길 때 붙습니다.",
        "사진 위의 회전 버튼으로 방향을 돌립니다. 휴지통으로 지웁니다.",
        "사진 위에 선을 긋고 싶으면 사진을 눌러 그리기 화면으로 들어갑니다.",
    ]),
    P("손이 모자라면 홈 설정의 <b>휴대폰으로 촬영해서 바로 받기</b>를 누릅니다. 나온 네모 코드를 휴대폰 카메라로 한 번만 찍으면, 그 다음부터 휴대폰으로 찍은 사진이 지금 연 손상에 들어옵니다."),
    P("건물 바깥 전경은 손상 사진과 다릅니다. 위쪽 <b>전경사진</b>에서 촬영하거나 갤러리로 넣고, 사진 아래에 무슨 사진인지 한 줄 적습니다. 한글 파일을 만들면 문서 맨 뒤에 나갑니다."),
)

add(
    "9", "도면 위 버튼",
    bullets([
        "<b>선택 / 핀 마킹 / 영역 마킹</b> — 8번에서 설명한 세 가지 일.",
        "<b>목록</b> — 왼쪽 손상 목록을 켜거나 끕니다.",
        "<b>회전</b> — 세로로 긴 도면을 옆으로 90도 돌립니다. 다시 누르면 계속 돌아갑니다.",
        "<b>+ / − / 맞춤</b> — 확대, 축소, 화면에 맞추기.",
        "<b>크기</b> — 번호 상자, 화살표, 연결선 굵기. 자물쇠를 풀어야 조절됩니다. <b>전체층 적용</b>은 이 크기를 모든 층에 복사합니다.",
        "<b>행·열</b> — 도면에 가로·세로 줄을 그어둡니다. 그러면 위치가 「X1~X2 / Y1~Y2」처럼 자동으로 적힙니다.",
        "<b>빈칸 땡기기</b> (컴퓨터) — 중간에 빈 번호를 앞에서부터 채웁니다. 예: 14, 15, 17은 14, 15, 16이 됩니다.",
        "<b>벡터 PDF</b> — 지금 층 또는 모든 층을, 도면 위에 번호를 얹은 PDF 파일로 저장합니다.",
        "태블릿 <b>더보기</b> 안의 <b>범위선택</b> — 켜 두고 빈 곳을 끌면 네모 안의 손상을 한꺼번에 고릅니다. 끄면 빈 곳 끌기는 도면 이동입니다.",
        "<b>추가</b> — 켜 두면 누를 때마다 선택이 더해지거나 빠집니다.",
    ]),
)

add(
    "10", "비파괴 적기",
    P("위쪽 <b>비파괴</b>로 갑니다. 먼저 위에 있는 종류 중 하나를 누릅니다. 종류를 바꾸지 않으면 방금 고른 종류로 계속 찍힙니다."),
    bullets([
        "<b>부재 실측</b> — 기둥·보의 설계 크기와 실제로 잰 크기",
        "<b>콘크리트 강도</b> — 슈미트 해머로 친 숫자",
        "<b>콘크리트 탄산화</b> — 시약이 변한 깊이",
        "<b>외벽 기울기</b> — 벽이 기운 정도",
        "<b>부동침하 기울기</b> — 건물이 내려앉은 정도. 점을 여러 개 모아 한 구역으로 적습니다.",
        "<b>부재변위</b> — 보나 슬래브가 처진 정도. 역시 구역으로 적습니다.",
        "<b>내화피복 두께</b> — 불에 견디는 피복의 두께",
    ]),
    P("종류를 고른 뒤 <b>핀 마킹</b>으로 잰 위치를 도면에 찍습니다. 입력 창이 열리면 부재와 위치를 적고, 그 종류에 나온 칸에 숫자를 넣습니다. 설계 크기와 실측을 넣으면 차이가 표에 계산됩니다."),
    P("아래 결과 표에서 그 줄을 다시 누르면 고칠 수 있습니다. 사진도 그 창에서 촬영하거나 갤러리로 넣습니다."),
)

add(
    "11", "균열 게이지와 균열 팁",
    P("비파괴 위에서 <b>균열 게이지·팁</b>을 누릅니다."),
    P("<b>핀 마킹</b>으로 게이지가 붙어 있는 위치를 도면에 찍습니다. 창이 열립니다. 위는 게이지, 아래는 팁입니다. 둘 다 적어도 되고, 하나만 적어도 됩니다."),
    P("<b>균열 게이지</b>는 균열 위에 붙인 눈금입니다."),
    bullets([
        "게이지 번호, 붙인 날, 처음 X와 처음 Y를 적습니다.",
        "<b>게이지 측정 행 추가</b>를 누르고 이번 측정 날, X, Y를 적습니다.",
        "처음보다 얼마나 벌어졌는지, 저번보다 얼마나 벌어졌는지는 알아서 계산됩니다.",
        "지난 사진과 이번 사진을 각각 넣으면 나란히 비교됩니다.",
    ]),
    P("<b>균열 팁</b>은 균열 끝이 얼마나 길어졌는지입니다."),
    bullets([
        "처음 길이를 적습니다.",
        "<b>팁 측정 행 추가</b>를 누르고 이번 길이를 적습니다.",
        "늘어난 길이는 알아서 계산됩니다.",
        "여기도 지난 사진과 이번 사진을 넣을 수 있습니다.",
    ]),
    P("창은 자동으로 저장됩니다. 잘못 찍은 게이지는 <b>마킹 삭제</b>로 지웁니다."),
)

add(
    "12", "상태조사표",
    P("<b>상태조사표</b>로 가면, 도면에 찍은 손상이 표로 나옵니다. 칸을 손가락으로 누르면 그 칸만 바로 고칠 수 있습니다."),
    P("글자를 치는 동안 키보드가 내려가면, 홈에서 한 번 새로고침한 뒤 다시 시도합니다. 칸을 다 치고 다른 곳을 누르면 저장됩니다."),
    P("<b>표 컬럼 설정</b>에서 표에 보일 칸을 고릅니다."),
    P("컴퓨터에서는 엑셀로 저장하거나, 예전에 만든 엑셀·한글 표를 가져올 수도 있습니다. 가져올 때는 빈 칸이 기존 내용을 지우지 않습니다. 적힌 칸만 덮어씁니다."),
)

add(
    "13", "한글 파일 만들기",
    P("컴퓨터에서 <b>상태조사표</b>를 연 뒤 <b>6개 사진배치 보고서 출력/미리보기</b>를 누릅니다."),
    P("미리보기 창 오른쪽 위 <b>한글로 저장</b>을 누릅니다."),
    bullets([
        "만들기 전에 다른 태블릿에만 있는 층도 받아 옵니다. 인터넷이 없으면 빠진 층이 있을 수 있다고 물어봅니다.",
        "손상이 하나도 없으면 파일이 만들어지지 않습니다.",
        "건물이 3종이면 3종 양식, 아니면 1·2종 양식으로 나갑니다. 건물 정보의 시설물 종별을 먼저 확인하세요.",
        "파일은 한글(한컴) 프로그램에서 엽니다.",
        "전경사진은 문서 맨 뒤에 붙습니다.",
        "만들기 전에 이상한 번호나 빠진 층이 있으면 한 번 물어봅니다. 취소하면 파일을 만들지 않으니, 고친 뒤 다시 누르면 됩니다.",
    ]),
    P("도면 위에 번호만 얹은 그림 파일이 필요하면, 결함위치도의 <b>벡터 PDF</b>를 씁니다. 한글 파일과는 다른 파일입니다."),
)

add(
    "14", "같이 쓸 때와 막힐 때",
    bullets([
        "같은 층에서 두 사람이 같은 번호를 새로 만들면, 나중에 올라온 번호가 뒤로 밀리고 안내가 뜹니다. 먼저 올린 사람 번호는 그대로입니다.",
        "고친 글이 옛 글로 돌아가면, 모든 태블릿에서 홈 <b>새로고침</b>을 한 번씩 하세요. 새로고침은 화면만 최신으로 바꾸고, 찍어 둔 손상은 지우지 않습니다.",
        "로그인이 안 되면 이메일과 비밀번호를 다시 확인합니다.",
        "승인 대기 화면이면 대표에게 가입 승인을 부탁합니다.",
        "도면이 안 바뀌면 그 층을 다시 연 뒤에도 옛 도면이면, 도면을 넣은 사람이 저장을 끝냈는지 확인합니다.",
    ]),
    P("이 설명은 화면 버튼을 기준으로 적었습니다. 버튼 이름이 조금 달라도 하는 일은 같습니다.", tip),
)


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(ACCENT)
    canvas.rect(0, A4[1] - 12 * mm, A4[0], 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(white)
    canvas.setFont("Malgun", 9)
    canvas.drawString(16 * mm, A4[1] - 8 * mm, "스마트 안전점검  ·  사용 설명")
    canvas.setFillColor(LINE)
    canvas.rect(0, 0, A4[0], 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Malgun", 8)
    canvas.drawCentredString(A4[0] / 2, 5 * mm, f"{doc.page}")
    canvas.restoreState()


def main():
    out = r"C:\Users\dlawo\.cursor\클로드 코드\building-safety-app\docs\스마트안전점검_사용설명.pdf"
    doc = SimpleDocTemplate(
        out, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=18 * mm, bottomMargin=16 * mm,
        title="스마트 안전점검 사용 설명",
        author="스마트 안전점검",
    )
    story = [
        Spacer(1, 8 * mm),
        P("스마트 안전점검", title),
        P("가입부터 도면, 마킹, 비파괴, 사진, 한글 파일까지", subtitle),
        HRFlowable(width="100%", thickness=1, color=LINE, spaceAfter=8),
        P("버튼 이름을 그대로 적었습니다. 위에서 아래로 따라 하면 됩니다."),
        Spacer(1, 2 * mm),
    ]
    for num, name, blocks in SECTIONS:
        story.append(P(f"{num}. {name}", h))
        story.extend(blocks)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(out)


if __name__ == "__main__":
    main()
