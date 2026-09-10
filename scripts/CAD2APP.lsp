;;; =========================================================================
;;;  CAD to Smart Safety App - 결함위치도 2점 정밀 캘리브레이션 추출기
;;;  버전: v2.4 (사용자 요청으로 v2.5~v2.8 되돌림 - 텍스트-원 1:1배정/텍스트박스중심/원-선1:1배정 모두 제거)
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

;; pt 근처(tol 이내)에서 시작/끝나는 LINE을 찾아 그 선 자체를 반환 (없으면 nil).
;; 원(circle)에 연결된 지시선, 또는 지시선이 꺾인 다음 구간을 찾는 데 공용으로 쓴다.
(defun findAttachedLine ( pt lines tol / result ln d1 d2 )
  (setq result nil)
  (foreach ln lines
    (if (null result)
      (progn
        (setq d1 (distance pt (car ln)))
        (setq d2 (distance pt (cadr ln)))
        (if (or (< d1 tol) (< d2 tol)) (setq result ln))
      )
    )
  )
  result
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
    ;; NO. 또는 숫자가 포함된 경우 결함 번호로 인정
    ((wcmatch upper "*NO*") T)
    ((wcmatch upper "*#*") T)
    (T nil)
  )
)

(defun c:CAD2APP ( / pt1 pt2 ss i ent dxf entType rawNo cleanNo boxPt tipPt
                     textList leaderList lineList circleList jsonList outPath f
                     minDist bestTip curDist p1 p2 d1 d2 firstItem maxDist
                     cPt cRad bestCircle minCircleDist
                     attachTol circleAnchorList anchorPt usedLine usedLine2
                     remainLines cAnchor
                     pairList idxT idxC ti ci usedTextIdx usedCircleIdx
                     circleAssign pr assigned usedLineIdx circleLineAssign boxInfo )
  (vl-load-com)
  (princ "\n=======================================================")
  (princ "\n  [CAD2APP v2.4] 스마트 안전점검 - 결함 번호/지시선 정밀 추출기")
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
      ((or (= entType "TEXT") (= entType "MTEXT"))
       (setq rawNo (cdr (assoc 1 dxf)))
       (setq cleanNo (cleanMText rawNo))
       (setq boxPt (cdr (assoc 10 dxf)))
       (if (and (isDefectText cleanNo) boxPt)
         (setq textList (cons (list cleanNo (list (car boxPt) (cadr boxPt))) textList))
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

      ;; (D) 일반 LINE (지시선 화살표용)
      ((= entType "LINE")
       (setq p1 (cdr (assoc 10 dxf)))
       (setq p2 (cdr (assoc 11 dxf)))
       ;; 너무 긴 선(벽체선/치수선, 8000 이상)은 지시선에서 제외
       (if (< (distance p1 p2) 8000.0)
         (setq lineList (cons (list (list (car p1) (cadr p1)) (list (car p2) (cadr p2))) lineList))
       )
      )

      ;; (E) CIRCLE (결함 위치를 찍어둔 원 - 있으면 지시선 추측보다 최우선으로 신뢰)
      ((= entType "CIRCLE")
       (setq cPt (cdr (assoc 10 dxf)))
       (setq cRad (cdr (assoc 40 dxf)))
       ;; 반지름 500짜리는 이 스크립트가 방금 찍은 기준점 표시용 원이므로 제외.
       ;; 결함위치 원이 500mm보다 크면 이 400 기준을 필요에 맞게 조정할 것.
       (if (and cPt cRad (< cRad 400.0))
         (setq circleList (cons (list (car cPt) (cadr cPt)) circleList))
       )
      )
    )
    (setq i (1+ i))
  )

  ;; 4. 원(CIRCLE) 각각에 대해, 그 원에 실제로(딱 붙어서) 연결된 지시선 "한 구간만" 따라가서
  ;;    텍스트 쪽 끝점(anchor)을 미리 구해둔다.
  ;;    (v2.3에서는 꺾인 지시선 대응용으로 2구간까지 따라갔는데, 밀집 구역에서 그 2번째 구간이
  ;;    엉뚱하게 옆 결함의 선으로 건너뛰어 버리는 문제가 확인되어 v2.4에서 1구간만 추적하도록 되돌림)
  (setq attachTol 80.0)  ;; 원 중심에서 이 거리 이내에서 시작하는 선만 "그 원에 연결된 선"으로 인정
  (setq circleAnchorList '())
  (foreach cPt circleList
    (setq anchorPt cPt)
    (setq usedLine (findAttachedLine cPt lineList attachTol))
    (if usedLine
      (progn
        (setq d1 (distance cPt (car usedLine)))
        (setq anchorPt (if (< d1 attachTol) (cadr usedLine) (car usedLine)))
      )
    )
    (setq circleAnchorList (cons (list cPt anchorPt) circleAnchorList))
  )

  ;; 5. 독립 텍스트와 주변 지시선/원 매칭 (최대 탐색 반경 3500mm)
  ;;    원(CIRCLE)의 anchor(지시선이 가리키는 텍스트쪽 지점)가 이 텍스트 박스와 가장 가까우면
  ;;    그 원을 결함 위치로 확정하고, 없을 때만 기존처럼 리더/라인 중 제일 가까운 끝점을
  ;;    추측으로 사용한다 (번호박스 자기 테두리선을 지시선으로 오인식하는 문제 방지).
  (setq maxDist 3500.0)
  (foreach txtItem textList
    (setq cleanNo (nth 0 txtItem))
    (setq boxPt (nth 1 txtItem))
    (setq bestTip boxPt)
    (setq minDist maxDist)

    ;; 0. CIRCLE 검색 (최우선, anchor 지점 기준)
    (setq bestCircle nil)
    (setq minCircleDist maxDist)
    (foreach cAnchor circleAnchorList
      (setq curDist (distance boxPt (cadr cAnchor)))
      (if (< curDist minCircleDist)
        (progn
          (setq minCircleDist curDist)
          (setq bestCircle (car cAnchor))
        )
      )
    )

    (if bestCircle
      (setq bestTip bestCircle)
      (progn
        ;; Leader 검색
        (foreach ldr leaderList
          (setq curDist (distance boxPt (cadr ldr)))
          (if (< curDist minDist)
            (progn
              (setq minDist curDist)
              (setq bestTip (car ldr))
            )
          )
        )

        ;; Line 검색
        (foreach ln lineList
          (setq d1 (distance boxPt (car ln)))
          (setq d2 (distance boxPt (cadr ln)))
          (if (and (< d1 minDist) (< d1 d2))
            (progn
              (setq minDist d1)
              (setq bestTip (cadr ln))
            )
          )
          (if (and (< d2 minDist) (< d2 d1))
            (progn
              (setq minDist d2)
              (setq bestTip (car ln))
            )
          )
        )
      )
    )

    (setq jsonList (cons (list cleanNo boxPt bestTip) jsonList))
  )

  (if (null jsonList)
    (progn (alert "추출할 수 있는 결함 번호가 없습니다.") (exit))
  )

  ;; 5. JSON 파일 저장
  (setq outPath (strcat (getenv "USERPROFILE") "\\Desktop\\cad_defects_import.json"))
  (setq f (open outPath "w"))
  (write-line "{" f)
  (write-line "  \"source\": \"AutoCAD\"," f)
  (write-line "  \"version\": \"2.4_revert\"," f)
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

  (alert (strcat "총 " (itoa (length jsonList)) "개의 결함(비결함 텍스트 제외 완료)과 기준점 2개를 추출했습니다!\n\n저장 경로:\n" outPath "\n\n이제 스마트 안전점검 앱에서 [📐 캐드 핀 가져오기]를 누르고 2개 기준점을 클릭해 주세요."))
  (princ (strcat "\n[CAD2APP v2.4] 추출 완료! 파일 경로: " outPath "\n"))
  (princ)
)

(princ "\n[CAD2APP v2.4] 로드 완료. 캐드 명령창에 CAD2APP 을 입력하세요.\n")
(princ)