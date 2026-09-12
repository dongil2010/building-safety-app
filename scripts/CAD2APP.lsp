;;; =========================================================================
;;;  CAD to Smart Safety App - 결함위치도 2점 정밀 캘리브레이션 추출기
;;;  버전: v2.24 (매칭 순서 유지: 텍스트 실제 바운딩박스 → 제일 가까운 지시선 끝점
;;;              → 반대쪽 끝의 같은 도면층 CIRCLE. v2.18 "아무 선" 금지 유지.
;;;              v2.21 회귀(~7 WRONG → ~30 WRONG) 대응: 과도한 확정 게이트
;;;              (uniqueNearest·상호최근접·비애매 AND·tol 220·확정거부 후 아무선
;;;              주황 폴백)를 완화. 거리순 그리디 1:1 확정으로 되돌리고,
;;;              미배정 폴백도 clear 지시선(같은 도면층 원)만 사용.
;;;              LWPOLYLINE 첫·끝 정점 지시선 후보 유지)
;;; =========================================================================

;; MTEXT 서식 제거 함수 ({\fGulim...;NO.01} -> NO.01)
(defun cleanMText ( str / pos endPos )
  (if (null str) (setq str ""))
  ;; 앞부분 {\...; 제거
  (while (and (setq pos (vl-string-search "{\\" str))
              (setq endPos (vl-string-search ";" str pos)))
    (setq str (strcat (substr str 1 pos) (substr str (+ endPos 2))))
  )
  ;; 단독 중괄호 및 역슬래시 정리
  (setq str (vl-string-translate "{}\\\r\n" "     " str))
  (vl-string-trim " " str)
)

;; pt에서 tol 이내에 있는 원(circle, (x y layer) 형식) 중 "제일 가까운" 원의 중심점
;; (x y)를 반환한다 (없으면 nil). layerFilter가 있으면 그 도면층인 원만 후보로 본다 —
;; 벽선·가구선 등 결함이랑 무관한 선이 우연히 원 근처에 있어도, 도면층이 다르면
;; 애초에 후보에서 빠지게 해서 오배정을 줄인다 (2026-09-12, 사용자 제안 반영).
;; 지시선의 어느 쪽 끝이 원에 붙어있는지 판단하는 데 쓴다 — 밀집구역에서 원 하나 근처에
;; 다른 결함의 선까지 여러 개 있을 수 있어서, 무조건 "처음 걸리는 선/원"이 아니라 실제
;; 거리가 제일 가까운 것을 골라야 옆 결함의 원을 잘못 가져가지 않는다.
(defun nearestCircleWithinTol ( pt circles tol layerFilter / c d bestD bestC )
  (setq bestD nil)
  (setq bestC nil)
  (foreach c circles
    (if (or (null layerFilter) (= (caddr c) layerFilter))
      (progn
        (setq d (distance pt (list (car c) (cadr c))))
        (if (and (< d tol) (or (null bestD) (< d bestD)))
          (progn (setq bestD d) (setq bestC (list (car c) (cadr c))))
        )
      )
    )
  )
  bestC
)

;; pt에서 tol 안·같은 도면층 원 중 제일 가까운 것을 (거리 . (x y)) 로 돌려준다.
;; 없으면 nil. 선 끝이 "원에 붙었는지"와 붙음 거리를 같이 볼 때 쓴다.
(defun nearestCircleDistWithinTol ( pt circles tol layerFilter / c d bestD bestC )
  (setq bestD nil)
  (setq bestC nil)
  (foreach c circles
    (if (or (null layerFilter) (= (caddr c) layerFilter))
      (progn
        (setq d (distance pt (list (car c) (cadr c))))
        (if (and (< d tol) (or (null bestD) (< d bestD)))
          (progn (setq bestD d) (setq bestC (list (car c) (cadr c))))
        )
      )
    )
  )
  (if bestC (cons bestD bestC) nil)
)

;; (v2.21용, v2.24에서는 쓰지 않음 — uniqueNearest가 정상 지시선까지 많이 탈락시킴)
;; 제일 가까운 원이 "유일하게" 가까운 경우에만 중심점 (x y)를 돌려준다.
(defun uniqueNearestCircleWithinTol ( pt circles tol layerFilter uniqMargin
                                      / c d bestD bestC secondD )
  (setq bestD nil)
  (setq bestC nil)
  (setq secondD nil)
  (foreach c circles
    (if (or (null layerFilter) (= (caddr c) layerFilter))
      (progn
        (setq d (distance pt (list (car c) (cadr c))))
        (if (< d tol)
          (cond
            ((null bestD)
             (setq bestD d)
             (setq bestC (list (car c) (cadr c)))
            )
            ((< d bestD)
             (setq secondD bestD)
             (setq bestD d)
             (setq bestC (list (car c) (cadr c)))
            )
            ((or (null secondD) (< d secondD))
             (setq secondD d)
            )
          )
        )
      )
    )
  )
  (if (and bestC (or (null secondD) (>= (- secondD bestD) uniqMargin)))
    bestC
    nil
  )
)

;; TEXT/MTEXT의 "삽입점"(그룹코드10)은 정렬방식(좌측정렬/가운데정렬 등)에 따라 글자 시작쪽으로
;; 치우쳐 있을 수 있다("NO.67"이면 "N" 쪽). 실제 박스의 바운딩박스(좌하단/우상단)를 구해서
;; (중심 좌하단 우상단) 3개를 리스트로 돌려준다 — 이후 매칭은 중심점이 아니라 "박스 전체에서
;; 제일 가까운 지점까지의 거리"로 계산해서, 지시선이 박스의 어느 변에 붙어있든(왼쪽="NO." 쪽,
;; 오른쪽=숫자 쪽, 위/아래) 정확히 잡히게 한다. 바운딩박스를 못 구하면 삽입점을 중심/모서리로
;; 그대로 쓴다(점 하나짜리 박스가 되어 기존과 동일하게 동작).
(defun getTextBox ( ent insertPt / vlaObj bbMin bbMax minList maxList cx cy )
  (setq minList nil maxList nil)
  (vl-catch-all-apply
    (function (lambda ()
      (setq vlaObj (vlax-ename->vla-object ent))
      (vla-GetBoundingBox vlaObj 'bbMin 'bbMax)
      (setq minList (vlax-safearray->list (vlax-variant-value bbMin)))
      (setq maxList (vlax-safearray->list (vlax-variant-value bbMax)))
    ))
  )
  (if (not (and minList maxList))
    (progn (setq minList insertPt) (setq maxList insertPt))
  )
  (setq cx (/ (+ (car minList) (car maxList)) 2.0))
  (setq cy (/ (+ (cadr minList) (cadr maxList)) 2.0))
  (list (list cx cy) (list (car minList) (cadr minList)) (list (car maxList) (cadr maxList)))
)

;; 점 pt 에서 (minPt maxPt)로 정의된 사각형까지의 최단거리 (pt가 사각형 안이면 0).
;; 사각형의 어느 변/모서리든 가장 가까운 지점까지의 거리를 정확히 계산한다.
(defun distPtToBox ( pt minPt maxPt / cx cy )
  (setq cx (max (car minPt) (min (car maxPt) (car pt))))
  (setq cy (max (cadr minPt) (min (cadr maxPt) (cadr pt))))
  (distance pt (list cx cy))
)

;; 결함 번호인지 확인 (관리실, 창고, 범례 등 제외)
(defun isDefectText ( str / upper )
  (setq upper (strcase str))
  (cond
    ;; 범례 및 실명 제외
    ((vl-string-search "관리실" upper) nil)
    ((vl-string-search "창고" upper) nil)
    ((vl-string-search "평면도" upper) nil)
    ((vl-string-search "결함발생" upper) nil)
    ((vl-string-search "상태양호" upper) nil)
    ((vl-string-search "구분" upper) nil)
    ((vl-string-search "내용" upper) nil)
    ((vl-string-search "적색" upper) nil)
    ((vl-string-search "청색" upper) nil)
    ((vl-string-search "주차장" upper) nil)
    ;; NO. 또는 리터럴 # 문자가 포함된 경우만 결함 번호로 인정.
    ;; (주의: wcmatch에서 # 는 "숫자 한 글자" 와일드카드라서 "*#*"는 "숫자가 하나라도
    ;;  있으면 매치"가 되어버림 — 리터럴 # 을 매치하려면 반드시 `# 로 이스케이프해야 함.
    ;;  이 버그 때문에 "소그룹실3" 같은 방 이름/그리드좌표/치수 텍스트가 전부 결함번호로
    ;;  오인식되던 문제가 있었음, 2026-09-11 수정)
    ((wcmatch upper "*NO*") T)
    ((wcmatch upper "*`#*") T)
    (T nil)
  )
)

;; "결함 도면층 자동감지"로 인정된 층 안에서만 쓰는 안전장치: 순수 숫자(3, 12, 3-1 등)만
;; 결함번호로 인정한다. 이 체크가 없으면 같은 도면층에 있는 "균열", "관리실" 같은 일반
;; 한글 라벨까지 전부 결함번호로 잡혀버린다 (2026-09-12 확인된 오인식 버그).
(defun isPureNumberText ( str / ch i len ok )
  (setq len (strlen str))
  (setq ok (> len 0))
  (setq i 1)
  (while (and ok (<= i len))
    (setq ch (substr str i 1))
    (if (not (or (and (>= ch "0") (<= ch "9")) (= ch "-") (= ch ".")))
      (setq ok nil)
    )
    (setq i (1+ i))
  )
  ok
)

;; "3-1" 같은 하위번호는 제외하고, 순수하게 숫자로만 된 결함번호("3","12" 등)인지 확인.
;; 빠진 번호(구멍) 찾기는 연속된 정수 하나짜리 번호끼리만 비교해야 의미가 있어서 별도로 둔다.
(defun isDigitsOnly ( str / ch i len ok )
  (setq len (strlen str))
  (setq ok (> len 0))
  (setq i 1)
  (while (and ok (<= i len))
    (setq ch (substr str i 1))
    (if (not (and (>= ch "0") (<= ch "9"))) (setq ok nil))
    (setq i (1+ i))
  )
  ok
)

(defun c:CAD2APP ( / pt1 pt2 ss i ent dxf entType rawNo cleanNo boxPt tipPt
                     textList leaderList lineList circleList jsonList outPath f
                     minDist bestTip curDist p1 p2 d1 d2 firstItem maxDist
                     cPt cRad bestCircle minCircleDist
                     attachTol circleAnchorList anchorPt usedLine usedLine2
                     remainLines cAnchor
                     pairList idxT idxC ti ci usedTextIdx usedCircleIdx
                     circleAssign pr assigned usedLineIdx circleLineAssign boxInfo
                     isDupCircle existC dupCircleCount txtEnt uncertainList uncertainMsg n
                     textCandidates layerVotes layerName existing detectedLayer bestCount tc
                     numberCounts dupNumberList numSeq missingNumberList seqMin seqMax
                     chk nv jItem dupMissingMsg txtItem
                     ln idxL whichEnd endPt farEnd matchedCircle lwPolyCount
                     verts leaderLineCount
                     bothEndGap clearLeaderList a1 a2 textEndPt
                     vlaObj coords )
  (vl-load-com)
  (princ "\n=======================================================")
  (princ "\n  [CAD2APP v2.24] 스마트 안전점검 - 결함 번호/지시선 정밀 추출기")
  (princ "\n=======================================================")

  ;; 1. 기준점 2개 지정
  (setq pt1 (getpoint "\n[1/3] 첫 번째 기준점 (예: 좌상단 기둥 중심)을 클릭하세요: "))
  (if (null pt1) (progn (princ "\n취소되었습니다.") (exit)))
  ;; 기준점 1 위치에 시각적 표시 (반지름 500 원)
  (entmake (list '(0 . "CIRCLE") (cons 10 pt1) '(40 . 500.0) '(62 . 1)))

  (setq pt2 (getpoint pt1 "\n[2/3] 두 번째 기준점 (예: 우하단 기둥 중심)을 클릭하세요: "))
  (if (null pt2) (progn (princ "\n취소되었습니다.") (exit)))
  ;; 기준점 2 위치에 시각적 표시
  (entmake (list '(0 . "CIRCLE") (cons 10 pt2) '(40 . 500.0) '(62 . 1)))

  (if (< (distance pt1 pt2) 1.0)
    (progn (alert "두 기준점 사이의 거리가 너무 가깝습니다.") (exit))
  )

  ;; 2. 결함 객체들 선택 (결함 위치를 표시하는 원(CIRCLE)도 함께 선택 — 지시선 오인식 방지용)
  (princ "\n[3/3] 도면 상의 결함 핀/문자/지시선/원을 드래그로 선택하세요: ")
  (setq ss (ssget '((0 . "MULTILEADER,LEADER,MTEXT,TEXT,LINE,LWPOLYLINE,CIRCLE"))))
  (if (null ss)
    (progn (princ "\n선택된 객체가 없습니다.") (exit))
  )

  (setq textList '())
  (setq leaderList '())
  (setq lineList '())
  (setq circleList '())
  (setq jsonList '())
  (setq dupCircleCount 0)
  (setq lwPolyCount 0)
  (setq uncertainList '())
  (setq textCandidates '())
  (setq layerVotes '())
  (setq i 0)

  ;; 3. 객체 분류
  (while (< i (sslength ss))
    (setq ent (ssname ss i))
    (setq dxf (entget ent))
    (setq entType (cdr (assoc 0 dxf)))

    (cond
      ;; (A) MULTILEADER
      ((= entType "MULTILEADER")
       (setq vlaObj (vlax-ename->vla-object ent))
       (setq rawNo (vlax-get-property vlaObj 'TextString))
       (setq cleanNo (cleanMText rawNo))
       (if (isDefectText cleanNo)
         (progn
           (setq tipPt (vlax-safearray->list (vlax-variant-value (vla-GetLeaderLineVertices vlaObj 0))))
           (setq tipPt (list (car tipPt) (cadr tipPt)))
           (setq boxPt (vlax-safearray->list (vlax-variant-value (vlax-get-property vlaObj 'TextPosition))))
           (setq boxPt (list (car boxPt) (cadr boxPt)))
           (setq jsonList (cons (list cleanNo boxPt tipPt) jsonList))
         )
       )
      )

      ;; (B) TEXT / MTEXT
      ;; "NO."/# 표기가 없는 순수 숫자 결함번호도 잡을 수 있도록, 일단 도면층 이름과 함께
      ;; 후보 목록에만 담아두고(textCandidates), 최종 채택 여부는 전체 분류가 끝난 뒤
      ;; "결함 도면층 자동감지" 결과를 반영해서 한꺼번에 결정한다 (아래 3-1 단계).
      ((or (= entType "TEXT") (= entType "MTEXT"))
       (setq rawNo (cdr (assoc 1 dxf)))
       (setq cleanNo (cleanMText rawNo))
       (setq boxPt (cdr (assoc 10 dxf)))
       (setq layerName (cdr (assoc 8 dxf)))
       (if boxPt
         (progn
           ;; 텍스트의 "삽입점"만 쓰면 정렬방식·글자수에 따라 지시선이 실제로 닿는
           ;; 위치와 어긋나서 밀집구역에서 엉뚱한 원과 매칭되는 원인이 된다 — 실제
           ;; 바운딩박스(좌하단/우상단)까지 같이 저장해서 매칭 정확도를 높인다.
           (setq boxInfo (getTextBox ent boxPt))
           (setq textCandidates (cons (list cleanNo (list (car boxPt) (cadr boxPt)) ent layerName
                                            (nth 1 boxInfo) (nth 2 boxInfo)) textCandidates))
           ;; NO./# 로 이미 확실하게 결함번호로 판별된 텍스트의 도면층에만 투표한다
           ;; (엉뚱한 도면층이 결함층으로 오인되지 않도록, "확실한" 표본만 사용)
           (if (isDefectText cleanNo)
             (progn
               (setq existing (assoc layerName layerVotes))
               (if existing
                 (setq layerVotes (subst (cons layerName (1+ (cdr existing))) existing layerVotes))
                 (setq layerVotes (cons (cons layerName 1) layerVotes))
               )
             )
           )
         )
       )
      )

      ;; (C) LEADER
      ((= entType "LEADER")
       (setq vlaObj (vlax-ename->vla-object ent))
       (setq coords (vlax-safearray->list (vlax-variant-value (vlax-get-property vlaObj 'Coordinates))))
       (if (>= (length coords) 6)
         (setq leaderList (cons (list (list (nth 0 coords) (nth 1 coords))
                                      (list (nth (- (length coords) 3) coords) (nth (- (length coords) 2) coords)))
                                leaderList))
       )
      )

      ;; (D) 일반 LINE (지시선 화살표용) — 도면층 이름도 같이 저장해서, 나중에
      ;; "이 선과 같은 도면층에 있는 원"만 짝지을 수 있게 한다.
      ((= entType "LINE")
       (setq p1 (cdr (assoc 10 dxf)))
       (setq p2 (cdr (assoc 11 dxf)))
       (setq layerName (cdr (assoc 8 dxf)))
       ;; 너무 긴 선(벽체선/치수선, 8000 이상)은 지시선에서 제외
       (if (< (distance p1 p2) 8000.0)
         (setq lineList (cons (list (list (car p1) (cadr p1)) (list (car p2) (cadr p2)) layerName) lineList))
       )
      )

      ;; (E) CIRCLE (결함 위치를 찍어둔 원 - 있으면 지시선 추측보다 최우선으로 신뢰)
      ((= entType "CIRCLE")
       (setq cPt (cdr (assoc 10 dxf)))
       (setq cRad (cdr (assoc 40 dxf)))
       (setq layerName (cdr (assoc 8 dxf)))
       ;; 반지름 500짜리는 이 스크립트가 방금 찍은 기준점 표시용 원이므로 제외.
       ;; 결함위치 원이 500mm보다 크면 이 400 기준을 필요에 맞게 조정할 것.
       (if (and cPt cRad (< cRad 400.0))
         (progn
           ;; 같은 자리에 원이 실수로 2개 겹쳐 그려진 경우(복사 실수 등) 중복 등록 방지.
           ;; 10mm 이내에 이미 등록된 원이 있으면 새로 추가하지 않는다.
           (setq isDupCircle nil)
           (foreach existC circleList
             (if (< (distance (list (car cPt) (cadr cPt)) (list (car existC) (cadr existC))) 10.0)
               (setq isDupCircle T)
             )
           )
           (if isDupCircle
             (progn
               (setq dupCircleCount (1+ dupCircleCount))
               ;; 중복 원을 캐드 화면에서 바로 확인할 수 있도록 마젠타(분홍/자주 계열)로 표시해둔다.
               ;; (사용 안 하는 원이니 지우거나, 진짜 위치로 옮겨서 다시 써도 됨)
               (entmod (list (cons -1 ent) (cons 62 6)))
               (entupd ent)
             )
             ;; 원도 도면층 이름을 같이 저장 (선-원 도면층 일치 검사용)
             (setq circleList (cons (list (car cPt) (cadr cPt) layerName) circleList))
           )
         )
       )
      )

      ;; (F) LWPOLYLINE — 첫 정점·끝 정점을 LINE과 같은 (p1 p2 layer) 형식으로
      ;; 지시선 후보에 넣는다. 꺾인 지시선도 텍스트 쪽/원 쪽 끝만 있으면 매칭 가능.
      ;; 너무 긴 것(벽체/치수, 8000 이상)은 LINE과 동일하게 제외. 개수는 진단용으로 유지.
      ((= entType "LWPOLYLINE")
       (setq lwPolyCount (1+ lwPolyCount))
       (setq layerName (cdr (assoc 8 dxf)))
       (setq verts '())
       (foreach item dxf
         (if (= (car item) 10)
           (setq verts (cons (list (cadr item) (caddr item)) verts))
         )
       )
       (setq verts (reverse verts))
       (if (>= (length verts) 2)
         (progn
           (setq p1 (car verts))
           (setq p2 (nth (1- (length verts)) verts))
           (if (< (distance p1 p2) 8000.0)
             (setq lineList (cons (list p1 p2 layerName) lineList))
           )
         )
       )
      )
    )
    (setq i (1+ i))
  )

  ;; 3-1. 결함 도면층 자동감지: NO./# 로 확실히 결함번호로 판별된 텍스트들이 가장 많이
  ;;    모여있는 도면층을 "결함 도면층"으로 자동 채택한다. 이 도면층에 있는 텍스트는
  ;;    NO./# 표기가 없는 순수 숫자("3","4" 등)여도 결함번호로 인정한다.
  ;;    (NO./# 조건은 안전장치로 계속 유지 — 결함 도면층이 아니어도 NO./# 표기가 있으면 인정)
  (setq detectedLayer nil)
  (setq bestCount 0)
  (foreach pr layerVotes
    (if (> (cdr pr) bestCount)
      (progn (setq bestCount (cdr pr)) (setq detectedLayer (car pr)))
    )
  )
  (if detectedLayer
    (princ (strcat "\n[결함 도면층 자동감지] \"" detectedLayer "\" 도면층 - 이 층의 텍스트는 순수 숫자여도 결함번호로 인정합니다."))
    (princ "\n[결함 도면층 자동감지] NO./# 표기 결함번호를 찾지 못해 도면층 자동감지를 건너뜁니다.")
  )
  (foreach tc textCandidates
    (setq cleanNo (nth 0 tc))
    (setq boxPt (nth 1 tc))
    (setq txtEnt (nth 2 tc))
    (setq layerName (nth 3 tc))
    (if (or (isDefectText cleanNo)
            (and detectedLayer (= layerName detectedLayer) (isPureNumberText cleanNo)))
      (setq textList (cons (list cleanNo boxPt txtEnt (nth 4 tc) (nth 5 tc)) textList))
    )
  )

  ;; 4~5. v2.24 핵심 매칭 순서 — 반드시 "텍스트 → 지시선 → 반대쪽 끝 → 원" 순서
  ;;
  ;; v2.23에서 남은 밀집구역 문제:
  ;;   텍스트에서 가장 가까운 선 끝을 기준으로 후보를 만든 뒤 단순 거리순 그리디를 하면,
  ;;   12가 56의 원으로 연결되는 것처럼 "가까운 선끝"은 맞지만 "반대쪽 원 연결"이 약한
  ;;   후보가 먼저 원을 차지할 수 있다.
  ;;
  ;; v2.24에서는 후보 생성 순서는 그대로 유지하되, 후보의 품질을 함께 평가한다.
  ;;   (1) TEXT 실제 바운딩박스 → 가장 가까운 지시선 끝점
  ;;   (2) 그 반대쪽 끝점 → 같은 Layer CIRCLE
  ;;   (3) 텍스트쪽 거리 + 원쪽 연결거리를 함께 사용해 후보 품질을 계산
  ;;   (4) 텍스트/원/지시선을 1:1로 배정
  ;;
  ;; 핵심은 "원에 가까운 선을 먼저 고르는 것"이 아니다.
  ;; 모든 후보가 먼저 사용자 지정 순서(텍스트→선끝→반대끝→원)를 통과한 뒤,
  ;; 그 중 텍스트 연결이 가깝고 반대쪽 원 연결도 강한 후보를 우선한다.
  ;;
  ;; v2.18의 "아무 LINE 최근접" 방식은 사용하지 않는다.
  ;; 반대쪽 끝에 같은 Layer CIRCLE이 없는 LINE/LWPOLYLINE은 후보가 되지 않는다.
  (setq attachTol 400.0)
  (setq maxDist 3500.0)
  ;; circleWeight가 너무 크면 텍스트와 먼 선을 선택하는 회귀가 생길 수 있으므로
  ;; 텍스트쪽 거리를 기본으로 유지하고 원쪽 연결을 보정값으로 사용한다.
  (setq circleWeight 1.20)
  (setq pairList '())

  ;; pair 형식:
  ;; (품질점수 텍스트→선끝거리 반대끝→원거리 텍스트인덱스 원중심 선인덱스)
  ;; 품질점수 = 텍스트거리 + circleWeight * 원연결거리
  ;; 원 연결거리는 반드시 같은 Layer CIRCLE만 대상으로 계산된다.
  (setq idxT 0)
  (foreach txtItem textList
    (setq boxPt (nth 1 txtItem))
    (setq idxL 0)

    (foreach ln lineList
      (setq p1 (car ln))
      (setq p2 (cadr ln))
      (setq layerName (caddr ln))

      ;; ★ 1단계: 실제 텍스트 바운딩박스에서 더 가까운 끝을 텍스트쪽 끝으로 결정
      (if (and (nth 3 txtItem) (nth 4 txtItem))
        (progn
          (setq d1 (distPtToBox p1 (nth 3 txtItem) (nth 4 txtItem)))
          (setq d2 (distPtToBox p2 (nth 3 txtItem) (nth 4 txtItem)))
        )
        (progn
          (setq d1 (distance boxPt p1))
          (setq d2 (distance boxPt p2))
        )
      )

      (if (<= (min d1 d2) maxDist)
        (progn
          (if (<= d1 d2)
            (progn
              (setq textEndPt p1)
              (setq farEnd p2)
              (setq curDist d1)
            )
            (progn
              (setq textEndPt p2)
              (setq farEnd p1)
              (setq curDist d2)
            )
          )

          ;; ★ 2단계: 반드시 반대쪽 끝에서 같은 Layer CIRCLE을 찾는다.
          ;; 반환값 = (원까지 거리 . 원중심)
          (setq a1 (nearestCircleDistWithinTol farEnd circleList attachTol layerName))

          (if a1
            (progn
              ;; ★ 3단계: 텍스트 연결을 우선하되 원 연결 상태도 점수에 반영.
              ;; 밀집구역에서 12→56 같은 약한 연결이 강한 실제 연결을 밀어내는 것을 줄인다.
              (setq circleDist (car a1))
              (setq matchedCircle (cdr a1))
              (setq pairScore (+ curDist (* circleWeight circleDist)))

              (setq pairList
                (cons
                  (list pairScore curDist circleDist idxT matchedCircle idxL)
                  pairList
                )
              )
            )
          )
        )
      )
      (setq idxL (1+ idxL))
    )
    (setq idxT (1+ idxT))
  )

  (princ (strcat "\n[진단] 원 " (itoa (length circleList))
                 "개, 선(LINE+LWPOLY 끝점) " (itoa (length lineList))
                 "개 — 텍스트→선끝→반대끝→같은 Layer 원 후보 생성 완료"))

  (if (> lwPolyCount 0)
    (princ (strcat "\n[진단] LWPOLYLINE " (itoa lwPolyCount)
                   "개는 첫·끝 정점으로 지시선 후보에 포함함"))
  )

  ;; ★ 4단계: 품질점수 순으로 1:1 배정.
  ;; 품질점수는 텍스트 연결거리 + 원 연결거리 보정이다.
  ;; v2.21처럼 후보를 대량 탈락시키는 hard gate는 사용하지 않는다.
  (setq pairList
    (vl-sort pairList
      (function
        (lambda (a b)
          (cond
            ((< (car a) (car b)) T)
            ((> (car a) (car b)) nil)
            ((< (cadr a) (cadr b)) T)
            ((> (cadr a) (cadr b)) nil)
            (T (< (nth 3 a) (nth 3 b)))
          )
        )
      )
    )
  )

  (setq usedTextIdx '())
  (setq usedCircleIdx '())
  (setq usedLineIdx '())
  (setq circleAssign '())

  (foreach pr pairList
    (setq ti (nth 3 pr))
    (setq matchedCircle (nth 4 pr))
    (setq idxL (nth 5 pr))

    (if (and (not (member ti usedTextIdx))
             (not (member matchedCircle usedCircleIdx))
             (not (member idxL usedLineIdx)))
      (progn
        (setq usedTextIdx (cons ti usedTextIdx))
        (setq usedCircleIdx (cons matchedCircle usedCircleIdx))
        (setq usedLineIdx (cons idxL usedLineIdx))
        (setq circleAssign (cons (cons ti matchedCircle) circleAssign))
      )
    )
  )

  ;; 6. 확정배정된 텍스트는 그 원을 결함 위치로 쓴다.
  ;;    미배정은 LEADER 엔티티만 보조 추측하고 주황 표시.
  ;;    일반 LINE 아무 최근접 추측(=v2.18)은 하지 않는다 — v2.21 WRONG 폭증의 핵심 원인.
  (setq idxT 0)
  (foreach txtItem textList
    (setq cleanNo (nth 0 txtItem))
    (setq boxPt (nth 1 txtItem))
    (setq txtEnt (nth 2 txtItem))
    (setq bestTip boxPt)
    (setq assigned (assoc idxT circleAssign))

    (if assigned
      (setq bestTip (cdr assigned))
      (progn
        ;; LEADER 객체(진짜 지시선 엔티티)만 보조 추측. 일반 LINE 아무 최근접은 금지.
        (setq minDist maxDist)
        (foreach ldr leaderList
          (setq curDist (distance boxPt (cadr ldr)))
          (if (< curDist minDist)
            (progn
              (setq minDist curDist)
              (setq bestTip (car ldr))
            )
          )
        )
        (setq uncertainList (cons cleanNo uncertainList))
        (entmod (list (cons -1 txtEnt) (cons 62 30)))
        (entupd txtEnt)
      )
    )

    (setq jsonList (cons (list cleanNo boxPt bestTip) jsonList))
    (setq idxT (1+ idxT))
  )

  (if (null jsonList)
    (progn (alert "추출할 수 있는 결함 번호가 없습니다.") (exit))
  )

  ;; 6-1. 결함번호 중복/누락 검사 — 저장하기 전에 확인해서 캐드에서 바로 고칠 수 있게 안내한다.
  (setq numberCounts '())
  (foreach jItem jsonList
    (setq cleanNo (nth 0 jItem))
    (setq existing (assoc cleanNo numberCounts))
    (if existing
      (setq numberCounts (subst (cons cleanNo (1+ (cdr existing))) existing numberCounts))
      (setq numberCounts (cons (cons cleanNo 1) numberCounts))
    )
  )
  (setq dupNumberList '())
  (foreach pr numberCounts
    (if (> (cdr pr) 1) (setq dupNumberList (cons (car pr) dupNumberList)))
  )
  ;; 중복번호로 확인된 텍스트를 노란색으로 표시 (MULTILEADER는 위치 특정이 애매해 TEXT/MTEXT만 표시)
  (if dupNumberList
    (foreach txtItem textList
      (if (member (nth 0 txtItem) dupNumberList)
        (progn
          (entmod (list (cons -1 (nth 2 txtItem)) (cons 62 2)))
          (entupd (nth 2 txtItem))
        )
      )
    )
  )
  ;; "3-1"처럼 하위번호가 붙은 건 순서 비교에서 빼고, 온전한 숫자 번호만 모아서 빠진 번호를 찾는다
  (setq numSeq '())
  (foreach pr numberCounts
    (if (isDigitsOnly (car pr)) (setq numSeq (cons (atoi (car pr)) numSeq)))
  )
  (setq missingNumberList '())
  (if (>= (length numSeq) 2)
    (progn
      (setq seqMin (car numSeq))
      (setq seqMax (car numSeq))
      (foreach nv numSeq
        (if (< nv seqMin) (setq seqMin nv))
        (if (> nv seqMax) (setq seqMax nv))
      )
      (setq chk seqMin)
      (while (<= chk seqMax)
        (if (not (member chk numSeq)) (setq missingNumberList (cons chk missingNumberList)))
        (setq chk (1+ chk))
      )
    )
  )
  (setq missingNumberList (reverse missingNumberList))

  ;; 7. JSON 파일 저장
  (setq outPath (strcat (getenv "USERPROFILE") "\\Desktop\\cad_defects_import.json"))
  (setq f (open outPath "w"))
  (write-line "{" f)
  (write-line "  \"source\": \"AutoCAD\"," f)
  (write-line "  \"version\": \"2.24_text_leader_circle_consistency\"," f)
  (write-line "  \"refPoint1\": {" f)
  (write-line (strcat "    \"x\": " (rtos (car pt1) 2 4) ",") f)
  (write-line (strcat "    \"y\": " (rtos (cadr pt1) 2 4)) f)
  (write-line "  }," f)
  (write-line "  \"refPoint2\": {" f)
  (write-line (strcat "    \"x\": " (rtos (car pt2) 2 4) ",") f)
  (write-line (strcat "    \"y\": " (rtos (cadr pt2) 2 4)) f)
  (write-line "  }," f)
  (write-line (strcat "  \"extractedCount\": " (itoa (length jsonList)) ",") f)
  (write-line "  \"defects\": [" f)

  (setq firstItem T)
  (foreach item (reverse jsonList)
    (setq cleanNo (nth 0 item))
    (setq boxPt (nth 1 item))
    (setq tipPt (nth 2 item))

    (if (not firstItem) (write-line "    ," f))
    (setq firstItem nil)

    (write-line "    {" f)
    (write-line (strcat "      \"no\": \"" cleanNo "\",") f)
    (write-line (strcat "      \"cadBoxX\": " (rtos (car boxPt) 2 4) ",") f)
    (write-line (strcat "      \"cadBoxY\": " (rtos (cadr boxPt) 2 4) ",") f)
    (write-line (strcat "      \"cadTipX\": " (rtos (car tipPt) 2 4) ",") f)
    (write-line (strcat "      \"cadTipY\": " (rtos (cadr tipPt) 2 4)) f)
    (write-line "    }" f)
  )

  (write-line "  ]" f)
  (write-line "}" f)
  (close f)

  ;; 원 없이 리더/라인으로 추측한 항목 목록 문구 조립
  (setq uncertainMsg "")
  (if uncertainList
    (progn
      (setq uncertainMsg (strcat "\n\n⚠ " (itoa (length uncertainList)) "개 결함 번호는 원(CIRCLE)을 못 찾아서 리더/라인 위치로 추측했습니다.\n해당 텍스트를 주황색으로 표시해뒀으니, 잘못 표기되었을 수 있으니 캐드에서 확인 후 수정해주세요.\n대상 번호: "))
      (setq firstItem T)
      (foreach n uncertainList
        (if (not firstItem) (setq uncertainMsg (strcat uncertainMsg ", ")))
        (setq uncertainMsg (strcat uncertainMsg n))
        (setq firstItem nil)
      )
    )
  )

  ;; 중복/빠진 번호 안내 문구 조립
  (setq dupMissingMsg "")
  (if dupNumberList
    (progn
      (setq dupMissingMsg (strcat dupMissingMsg "\n\n⚠ 중복된 결함번호 " (itoa (length dupNumberList)) "개를 발견해서 노란색으로 표시해뒀습니다.\n대상 번호: "))
      (setq firstItem T)
      (foreach n dupNumberList
        (if (not firstItem) (setq dupMissingMsg (strcat dupMissingMsg ", ")))
        (setq dupMissingMsg (strcat dupMissingMsg n))
        (setq firstItem nil)
      )
    )
  )
  (if missingNumberList
    (progn
      (setq dupMissingMsg (strcat dupMissingMsg "\n\n⚠ 번호 " (itoa seqMin) "~" (itoa seqMax) " 사이에 빠진 번호가 있습니다: "))
      (setq firstItem T)
      (foreach n missingNumberList
        (if (not firstItem) (setq dupMissingMsg (strcat dupMissingMsg ", ")))
        (setq dupMissingMsg (strcat dupMissingMsg (itoa n)))
        (setq firstItem nil)
      )
    )
  )

  (princ (strcat "\n[진단] 텍스트 " (itoa (length textList)) "개 중 원으로 확정배정 "
                 (itoa (length circleAssign)) "개, 리더/라인 추측(주황) "
                 (itoa (length uncertainList)) "개"))

  (alert (strcat "총 " (itoa (length jsonList)) "개의 결함(비결함 텍스트 제외 완료)과 기준점 2개를 추출했습니다!\n\n저장 경로:\n" outPath "\n\n이제 스마트 안전점검 앱에서 [📐 캐드 핀 가져오기]를 누르고 2개 기준점을 클릭해 주세요."
    (if (> dupCircleCount 0)
      (strcat "\n\n⚠ 같은 자리에 겹쳐 그려진 원 " (itoa dupCircleCount) "개를 발견해서 마젠타(분홍/자주) 색으로 표시해뒀습니다.\n도면에서 마젠타색 원을 찾아 확인 후, 진짜 위치로 옮기거나 필요없으면 지워주세요.")
      ""
    )
    dupMissingMsg
    uncertainMsg
  ))
  (princ (strcat "\n[CAD2APP v2.24] 추출 완료! 파일 경로: " outPath "\n"))
  (princ)
)

(princ "\n[CAD2APP v2.24] 로드 완료. 캐드 명령창에 CAD2APP 을 입력하세요.\n")
(princ)