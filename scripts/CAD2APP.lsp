;;; =========================================================================
;;;  CAD to Smart Safety App - 결함위치도 2점 정밀 캘리브레이션 추출기
;;;  버전: v2.19 (v2.18의 "텍스트에 제일 가까운 아무 선"이 벽선/가구선까지 걸려서
;;;              오배정이 훨씬 늘어난 문제 확인 → v2.17의 "선의 한쪽 끝이 원에 붙어야
;;;              지시선 후보로 인정" 방식으로 되돌림 + 선-원이 "같은 도면층"일 때만
;;;              인정하는 조건 추가(사용자 제안) — 도면층이 다르면 아무리 가까워도
;;;              후보에서 빠지므로 거리 기준도 500까지 여유 있게 늘림. 원/선/확정배정
;;;              개수와 LWPOLYLINE 처리 여부를 콘솔에 출력하는 진단 로그 추가)
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
                     ln idxL whichEnd endPt farEnd matchedCircle lwPolyCount )
  (vl-load-com)
  (princ "\n=======================================================")
  (princ "\n  [CAD2APP v2.19] 스마트 안전점검 - 결함 번호/지시선 정밀 추출기")
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

      ;; (F) LWPOLYLINE — 아직 지시선으로 처리하지 않음. 이 도면에서 지시선이
      ;; LINE이 아니라 LWPOLYLINE으로 그려졌을 가능성을 진단하기 위해 개수만 센다.
      ((= entType "LWPOLYLINE")
       (setq lwPolyCount (1+ lwPolyCount))
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

  ;; 4. v2.18에서 "텍스트에 제일 가까운 선"을 원 연결 여부와 상관없이 아무 선이나
  ;;    후보로 삼았더니, 벽선·가구선처럼 결함이랑 무관한 짧은 선까지 걸려서 오히려
  ;;    오배정이 훨씬 늘어났다 (2026-09-12 실사용 확인 — 반드시 되돌릴 것).
  ;;    그래서 "선의 한쪽 끝이 원에 붙어있어야만 지시선 후보로 인정"하는 v2.17 방식으로
  ;;    되돌리고, 여기에 사용자 제안대로 "같은 도면층"인 원만 인정하는 조건을 추가한다.
  ;;    도면층이 다르면 아무리 가까워도 후보에서 제외되므로, 벽선·가구선이 결함 원 근처를
  ;;    지나가도 안전하다 — 그래서 거리 기준(attachTol)도 여유 있게 늘릴 수 있다.
  (setq attachTol 500.0)  ;; 같은 도면층 안에서, 이 거리 이내면 "원에 연결된 선"으로 인정
  (setq circleAnchorList '())
  (foreach ln lineList
    (setq bestCircle (nearestCircleWithinTol (car ln) circleList attachTol (caddr ln)))
    (setq matchedCircle (nearestCircleWithinTol (cadr ln) circleList attachTol (caddr ln)))
    (cond
      ;; 시작점만 원에 붙어있으면 반대쪽 끝(cadr)이 텍스트 쪽 anchor
      ((and bestCircle (not matchedCircle))
       (setq circleAnchorList (cons (list bestCircle (cadr ln)) circleAnchorList))
      )
      ;; 끝점만 원에 붙어있으면 반대쪽 끝(car)이 텍스트 쪽 anchor
      ((and matchedCircle (not bestCircle))
       (setq circleAnchorList (cons (list matchedCircle (car ln)) circleAnchorList))
      )
      ;; 양쪽 다 원에 붙었거나(원-원 직결) 둘 다 안 붙었으면 애매한 선이므로 후보에서 제외
    )
  )
  ;; 진단용 로그 — 원/선/후보 개수를 찍어서, 다음에도 틀리면 허용거리(attachTol) 문제인지
  ;; 애초에 선 개수 자체가 원 개수보다 훨씬 적은(LWPOLYLINE 등 다른 형식) 문제인지 구분한다.
  (princ (strcat "\n[진단] 원 " (itoa (length circleList)) "개, 선 " (itoa (length lineList))
                 "개 중 원에 연결된 것으로 확정된 선 " (itoa (length circleAnchorList)) "개"))
  (if (> lwPolyCount 0)
    (princ (strcat "\n[진단] LWPOLYLINE " (itoa lwPolyCount) "개는 아직 지시선으로 처리 안 함 (선택은 됐지만 무시됨)"))
  )

  ;; 5. 텍스트-원 전체 조합의 거리쌍을 계산해 그리디 1:1 확정배정한다.
  (setq maxDist 3500.0)
  (setq pairList '())
  (setq idxT 0)
  (foreach txtItem textList
    (setq boxPt (nth 1 txtItem))
    (setq idxC 0)
    (foreach cAnchor circleAnchorList
      ;; 텍스트 삽입점 하나가 아니라 실제 글자 박스(있으면)까지의 최단거리로 비교한다.
      (if (and (nth 3 txtItem) (nth 4 txtItem))
        (setq curDist (distPtToBox (cadr cAnchor) (nth 3 txtItem) (nth 4 txtItem)))
        (setq curDist (distance boxPt (cadr cAnchor)))
      )
      (if (< curDist maxDist)
        (setq pairList (cons (list curDist idxT idxC) pairList))
      )
      (setq idxC (1+ idxC))
    )
    (setq idxT (1+ idxT))
  )
  (setq pairList (vl-sort pairList (function (lambda (a b) (< (car a) (car b))))))

  (setq usedTextIdx '())
  (setq usedCircleIdx '())  ;; 원 좌표 자체로 중복 배정 방지 (선이 2개 붙어 같은 원이
                             ;; circleAnchorList에 중복 등장해도 한 번만 배정)
  (setq circleAssign '())  ;; ((idxT . 원중심점) ...)
  (foreach pr pairList
    (setq ti (nth 1 pr))
    (setq idxC (nth 2 pr))
    (setq matchedCircle (car (nth idxC circleAnchorList)))
    (if (and (not (member ti usedTextIdx)) (not (member matchedCircle usedCircleIdx)))
      (progn
        (setq usedTextIdx (cons ti usedTextIdx))
        (setq usedCircleIdx (cons matchedCircle usedCircleIdx))
        (setq circleAssign (cons (cons ti matchedCircle) circleAssign))
      )
    )
  )

  ;; 6. 확정배정된 텍스트는 그 원을 결함 위치로 쓰고, 원을 못 받은 텍스트만 기존처럼
  ;;    리더/라인 중 제일 가까운 끝점을 추측으로 사용한다.
  (setq idxT 0)
  (foreach txtItem textList
    (setq cleanNo (nth 0 txtItem))
    (setq boxPt (nth 1 txtItem))
    (setq txtEnt (nth 2 txtItem))
    (setq bestTip boxPt)
    (setq minDist maxDist)
    (setq assigned (assoc idxT circleAssign))

    (if assigned
      (setq bestTip (cdr assigned))
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

        ;; 원(CIRCLE)으로 확정배정을 못 받은 항목 - 리더/라인 추측값이라 틀릴 수 있으니
        ;; 캐드에서 바로 눈에 띄게 텍스트를 주황색으로 표시하고, 완료 메시지에도 목록으로 안내한다.
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
  (write-line "  \"version\": \"2.13_layer_autodetect\"," f)
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
  (princ (strcat "\n[CAD2APP v2.19] 추출 완료! 파일 경로: " outPath "\n"))
  (princ)
)

(princ "\n[CAD2APP v2.19] 로드 완료. 캐드 명령창에 CAD2APP 을 입력하세요.\n")
(princ)