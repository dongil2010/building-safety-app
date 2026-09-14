;;; =========================================================================
;;;  CAD to Smart Safety App - 결함위치도 2점 정밀 캘리브레이션 추출기
;;;  버전: v2.29 (테두리: v2.25식 닫힌 4변 LWPOLY + 맞닿은 4선 거의-직사각
;;;              복구 + 특수 이중 평행변(gap≤2.0, 약 0.735mm)만 추가 제외.
;;;              4~8선 클러스터·박스둘레 양끝 LINE 과필터·away-leader 없음.
;;;              매칭은 v2.28/v2.24식 단순 그리디 + 가벼운 2-스왑·애매 주황.
;;;              미배정 폴백은 LEADER 엔티티만 사용)
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

;; (v2.21용, v2.29에서도 쓰지 않음 — uniqueNearest가 정상 지시선까지 많이 탈락시킴)
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

;; ---------- v2.29: 텍스트 테두리 감지 (지시선 후보에서만) ----------
;; v2.25식: 닫힌 4변 LWPOLY / 맞닿은 LINE 4개 거의-직사각(강도 유지).
;; 특수 추가: 평행 이중변 gap≤2.0(약 0.735mm) — 같은 글자박스 근처·프레임
;; 길이일 때만 그 두 변만 제외. 4~8선 클러스터·박스둘레 양끝 LINE은 넣지 않음.
(defun cad2-ptClose ( a b tol )
  (and a b (<= (distance a b) tol))
)

(defun cad2-samePt ( a b )
  (and a b (< (distance a b) 0.5))
)

(defun cad2-vdot2 ( u v )
  (+ (* (car u) (car v)) (* (cadr u) (cadr v)))
)

(defun cad2-lineLen ( ln )
  (distance (car ln) (cadr ln))
)

(defun cad2-lineMid ( ln )
  (list (/ (+ (car (car ln)) (car (cadr ln))) 2.0)
        (/ (+ (cadr (car ln)) (cadr (cadr ln))) 2.0))
)

(defun cad2-lineDir ( ln / len dx dy )
  (setq len (cad2-lineLen ln))
  (if (< len 1e-9)
    nil
    (progn
      (setq dx (- (car (cadr ln)) (car (car ln))))
      (setq dy (- (cadr (cadr ln)) (cadr (car ln))))
      (list (/ dx len) (/ dy len))
    )
  )
)

(defun cad2-dirsParallel ( d1 d2 / c )
  (setq c (abs (cad2-vdot2 d1 d2)))
  (>= c 0.98)
)

;; 점에서 무한직선(a-b)까지 수직거리.
(defun cad2-distPtToInfLine ( pt a b / ab len )
  (setq ab (list (- (car b) (car a)) (- (cadr b) (cadr a))))
  (setq len (distance a b))
  (if (< len 1e-9)
    (distance pt a)
    (/ (abs (- (* (- (car pt) (car a)) (cadr ab))
               (* (- (cadr pt) (cadr a)) (car ab))))
       len)
  )
)

;; 선분 방향 투영 겹침 비율(짧은 쪽 길이 기준). 0~1.
(defun cad2-segProjOverlapRatio ( ln1 ln2 / d ax ay bx by p1 p2 q1 q2
                                         t1 t2 s1 s2 lo hi span )
  (setq d (cad2-lineDir ln1))
  (if (null d)
    0.0
    (progn
      (setq ax (car (car ln1)) ay (cadr (car ln1)))
      (setq p1 0.0)
      (setq p2 (cad2-lineLen ln1))
      (setq bx (car (car ln2)) by (cadr (car ln2)))
      (setq q1 (cad2-vdot2 (list (- bx ax) (- by ay)) d))
      (setq q2 (cad2-vdot2 (list (- (car (cadr ln2)) ax) (- (cadr (cadr ln2)) ay)) d))
      (setq t1 (min p1 p2) t2 (max p1 p2))
      (setq s1 (min q1 q2) s2 (max q1 q2))
      (setq lo (max t1 s1) hi (min t2 s2))
      (setq span (min (- t2 t1) (- s2 s1)))
      (if (or (<= span 1e-9) (>= lo hi))
        0.0
        (/ (- hi lo) span)
      )
    )
  )
)

;; 거의 평행하고 간격이 (0, maxGap] 이며 길이·투영이 비슷한 이중변인가.
(defun cad2-isParallelDouble ( ln1 ln2 maxGap / d1 d2 g len1 len2 )
  (setq d1 (cad2-lineDir ln1))
  (setq d2 (cad2-lineDir ln2))
  (if (not (and d1 d2 (cad2-dirsParallel d1 d2)))
    nil
    (progn
      (setq len1 (cad2-lineLen ln1) len2 (cad2-lineLen ln2))
      (setq g (cad2-distPtToInfLine (cad2-lineMid ln1) (car ln2) (cadr ln2)))
      (and (> len1 1.0) (> len2 1.0)
           (<= (abs (- len1 len2)) (* 0.40 (max len1 len2)))
           (> g 0.05) (<= g maxGap)
           (>= (cad2-segProjOverlapRatio ln1 ln2) 0.25))
    )
  )
)

;; 시계/반시계 순 4꼭짓점이 거의 직사각형인지 판정 (대변 길이·직각만 봄).
(defun cad2-isNearlyRectPts ( pts / a b c d ab bc cd da lab lbc lcd lda )
  (if (/= (length pts) 4)
    nil
    (progn
      (setq a (nth 0 pts) b (nth 1 pts) c (nth 2 pts) d (nth 3 pts))
      (setq lab (distance a b) lbc (distance b c) lcd (distance c d) lda (distance d a))
      (if (or (< lab 1.0) (< lbc 1.0) (< lcd 1.0) (< lda 1.0))
        nil
        (progn
          (setq ab (list (- (car b) (car a)) (- (cadr b) (cadr a))))
          (setq bc (list (- (car c) (car b)) (- (cadr c) (cadr b))))
          (setq cd (list (- (car d) (car c)) (- (cadr d) (cadr c))))
          (setq da (list (- (car a) (car d)) (- (cadr a) (cadr d))))
          (and
            (<= (abs (- lab lcd)) (* 0.25 (max lab lcd)))
            (<= (abs (- lbc lda)) (* 0.25 (max lbc lda)))
            (<= (abs (cad2-vdot2 ab bc)) (* 0.35 lab lbc))
            (<= (abs (cad2-vdot2 bc cd)) (* 0.35 lbc lcd))
            (<= (abs (cad2-vdot2 cd da)) (* 0.35 lcd lda))
            (<= (abs (cad2-vdot2 da ab)) (* 0.35 lda lab))
          )
        )
      )
    )
  )
)

;; 꼭짓점을 중심 기준 각도순으로 정렬해 사각형 판정에 쓸 순서를 만든다.
(defun cad2-orderCornersByAngle ( pts / cx cy keyed p )
  (setq cx 0.0 cy 0.0)
  (foreach p pts
    (setq cx (+ cx (car p)))
    (setq cy (+ cy (cadr p)))
  )
  (setq cx (/ cx (float (length pts))))
  (setq cy (/ cy (float (length pts))))
  (setq keyed '())
  (foreach p pts
    (setq keyed (cons (cons (angle (list cx cy) p) p) keyed))
  )
  (setq keyed
    (vl-sort keyed (function (lambda ( a b ) (< (car a) (car b)))))
  )
  (mapcar (function cdr) keyed)
)

;; 닫힌(또는 시작=끝) 4변 LWPOLY가 작은 거의-직사각형 테두리인지.
(defun cad2-isTextBorderLwpoly ( dxf verts maxSide / closedFlag n pts sideOk i a b )
  (setq closedFlag
    (and (assoc 70 dxf) (= (logand (cdr (assoc 70 dxf)) 1) 1))
  )
  (setq pts verts)
  (setq n (length pts))
  (if (and (>= n 5) (cad2-ptClose (car pts) (nth (1- n) pts) 1.0))
    (progn
      (setq pts (reverse (cdr (reverse pts))))
      (setq n (length pts))
      (setq closedFlag T)
    )
  )
  (if (and (= n 4) closedFlag)
    (progn
      (setq sideOk T)
      (setq i 0)
      (while (and sideOk (< i 4))
        (setq a (nth i pts))
        (setq b (nth (rem (1+ i) 4) pts))
        (if (> (distance a b) maxSide) (setq sideOk nil))
        (setq i (1+ i))
      )
      (and sideOk (cad2-isNearlyRectPts pts))
    )
    nil
  )
)

(defun cad2-linesShareEnd ( ln1 ln2 tol )
  (or (cad2-ptClose (car ln1) (car ln2) tol)
      (cad2-ptClose (car ln1) (cadr ln2) tol)
      (cad2-ptClose (cadr ln1) (car ln2) tol)
      (cad2-ptClose (cadr ln1) (cadr ln2) tol))
)

;; 선분이 같은 글자 박스 근처의 프레임 변인지(중점 근접 + 길이가 박스 대비 과도하지 않음).
;; v2.28의 scale 1.5는 글자박스보다 큰 테두리 변을 놓쳐, v2.29는 여유(scale 4 + 하한 200)만 둔다.
(defun cad2-lineIsFrameEdgeNearBox ( ln minPt maxPt scale minLim / mid len tw th lim nearLim )
  (setq mid (cad2-lineMid ln))
  (setq len (cad2-lineLen ln))
  (setq tw (abs (- (car maxPt) (car minPt))))
  (setq th (abs (- (cadr maxPt) (cadr minPt))))
  (setq lim (max (* scale (max tw th 1.0)) minLim))
  (setq nearLim (max tw th 80.0))
  (and (<= len lim)
       (<= (distPtToBox mid minPt maxPt) nearLim))
)

;; 평행 이중변 두 선이 같은 글자 박스의 프레임 이중변으로 보이는지.
(defun cad2-parallelDoubleNearSameText ( ln1 ln2 textBoxes
                                         / box minPt maxPt found )
  (setq found nil)
  (foreach box textBoxes
    (setq minPt (car box) maxPt (cadr box))
    (if (and minPt maxPt (not found)
             (cad2-lineIsFrameEdgeNearBox ln1 minPt maxPt 4.0 200.0)
             (cad2-lineIsFrameEdgeNearBox ln2 minPt maxPt 4.0 200.0))
      (setq found T)
    )
  )
  found
)

;; 네 선분 끝점에서 중복을 합쳐 꼭짓점 목록을 만든다.
(defun cad2-uniqueCornersFromLines ( lnA lnB lnC lnD tol / raw pts p q found )
  (setq raw (list (car lnA) (cadr lnA) (car lnB) (cadr lnB)
                  (car lnC) (cadr lnC) (car lnD) (cadr lnD)))
  (setq pts '())
  (foreach p raw
    (setq found nil)
    (foreach q pts
      (if (cad2-ptClose p q tol) (setq found T))
    )
    (if (not found) (setq pts (cons p pts)))
  )
  pts
)

;; 서로 맞닿은 LINE 4개가 작은 거의-직사각형을 이루면 T. (v2.25 강도: 이웃 정확히 2, 꼭짓점 4)
(defun cad2-fourLinesFormSmallRect ( lnA lnB lnC lnD joinTol maxSide
                                     / setL ln o touchCnt corners ordered ok )
  (setq setL (list lnA lnB lnC lnD))
  (if (or (> (cad2-lineLen lnA) maxSide)
          (> (cad2-lineLen lnB) maxSide)
          (> (cad2-lineLen lnC) maxSide)
          (> (cad2-lineLen lnD) maxSide))
    nil
    (progn
      ;; 각 선이 나머지 중 정확히 2개와 끝점을 공유해야 닫힌 4각형이다.
      (setq ok T)
      (foreach ln setL
        (setq touchCnt 0)
        (foreach o setL
          (if (and (not (eq o ln)) (cad2-linesShareEnd ln o joinTol))
            (setq touchCnt (1+ touchCnt))
          )
        )
        (if (/= touchCnt 2) (setq ok nil))
      )
      (if (not ok)
        nil
        (progn
          (setq corners (cad2-uniqueCornersFromLines lnA lnB lnC lnD joinTol))
          (if (/= (length corners) 4)
            nil
            (progn
              (setq ordered (cad2-orderCornersByAngle corners))
              (cad2-isNearlyRectPts ordered)
            )
          )
        )
      )
    )
  )
)

;; (ti, 원중심) 조합의 최저 품질점수를 pairList에서 찾는다. 없으면 nil.
(defun cad2-bestPairScoreFor ( pairList ti circ / best pr )
  (setq best nil)
  (foreach pr pairList
    (if (and (= (nth 3 pr) ti) (cad2-samePt (nth 4 pr) circ))
      (if (or (null best) (< (car pr) best))
        (setq best (car pr))
      )
    )
  )
  best
)

;; 텍스트 ti의 pair 중 텍스트쪽 거리가 가장 짧은 후보의 원 중심.
(defun cad2-nearestCircByTextDist ( pairList ti / bestPr pr )
  (setq bestPr nil)
  (foreach pr pairList
    (if (= (nth 3 pr) ti)
      (if (or (null bestPr)
              (< (cadr pr) (cadr bestPr))
              (and (= (cadr pr) (cadr bestPr)) (< (car pr) (car bestPr))))
        (setq bestPr pr)
      )
    )
  )
  (if bestPr (nth 4 bestPr) nil)
)

;; lineList에서 텍스트 테두리 LINE을 뺀다.
;; (1) v2.25: 맞닿은 4선 거의-직사각형
;; (2) v2.29 특수: 평행 이중변(gap≤parallelGap≈0.735mm) — 같은 글자박스 근처일 때만 그 두 변
;; 4~8선 클러스터·박스둘레 양끝 LINE 과필터는 넣지 않는다.
;; 반환: (filteredLines excludedLineCount frameCount)
(defun cad2-filterRectBorderLines ( lines joinTol maxSide parallelGap textBoxes
                                    / n shortIdxs excl i ii jj kk mm
                                      lnI lnJ lnK frameCount filtered idx )
  (setq n (length lines))
  (setq shortIdxs '())
  (setq i 0)
  (while (< i n)
    (if (<= (cad2-lineLen (nth i lines)) maxSide)
      (setq shortIdxs (cons i shortIdxs))
    )
    (setq i (1+ i))
  )
  (setq shortIdxs (reverse shortIdxs))
  (setq excl '())
  (setq frameCount 0)

  ;; (1) v2.25: 맞닿은 4선 거의-직사각형
  (foreach ii shortIdxs
    (if (not (member ii excl))
      (progn
        (setq lnI (nth ii lines))
        (foreach jj shortIdxs
          (if (and (not (member jj excl))
                   (/= jj ii)
                   (cad2-linesShareEnd lnI (nth jj lines) joinTol))
            (progn
              (setq lnJ (nth jj lines))
              (foreach kk shortIdxs
                (if (and (not (member kk excl))
                         (/= kk ii) (/= kk jj)
                         (cad2-linesShareEnd lnJ (nth kk lines) joinTol))
                  (progn
                    (setq lnK (nth kk lines))
                    (foreach mm shortIdxs
                      (if (and (not (member mm excl))
                               (/= mm ii) (/= mm jj) (/= mm kk)
                               (cad2-linesShareEnd (nth mm lines) lnI joinTol)
                               (cad2-fourLinesFormSmallRect
                                 lnI lnJ lnK (nth mm lines) joinTol maxSide))
                        (progn
                          (setq excl (cons ii (cons jj (cons kk (cons mm excl)))))
                          (setq frameCount (1+ frameCount))
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  )

  ;; (2) v2.29 특수: 평행 이중변 — 같은 글자박스 근처 프레임 변 쌍만(과필터 금지)
  (if textBoxes
    (foreach ii shortIdxs
      (if (not (member ii excl))
        (foreach jj shortIdxs
          (if (and (> jj ii)
                   (not (member jj excl))
                   (cad2-isParallelDouble (nth ii lines) (nth jj lines) parallelGap)
                   (cad2-parallelDoubleNearSameText
                     (nth ii lines) (nth jj lines) textBoxes))
            (progn
              (setq excl (cons ii (cons jj excl)))
              (setq frameCount (1+ frameCount))
            )
          )
        )
      )
    )
  )

  (setq filtered '())
  (setq idx 0)
  (foreach lnI lines
    (if (not (member idx excl))
      (setq filtered (cons lnI filtered))
    )
    (setq idx (1+ idx))
  )
  (list (reverse filtered) (length excl) frameCount)
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
                     vlaObj coords
                     frameMaxSide borderJoinTol borderFilter
                     borderLineSkip borderFrameLine borderFrameLw
                     circleWeight circleDist pairScore
                     parallelGap textBoxes farBoxDist lnLen
                     ambMargin ambiguousIdx ambiguousList ambiguousMsg
                     asgA asgB asgX tiA tiB circA circB sAC sAD sBC sBD
                     newAssign nearA nearB secondSc bestSc )
  (vl-load-com)
  (princ "\n=======================================================")
  (princ "\n  [CAD2APP v2.29] 스마트 안전점검 - 결함 번호/지시선 정밀 추출기")
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
  ;; 텍스트 테두리 네모 한 변 최대 길이 / 끝점 접합 허용 (도면 단위 mm 가정)
  ;; v2.29: v2.25식 4선(joinTol 15) + 이중변 gap≤2.0만 특수 추가(과필터 금지)
  (setq frameMaxSide 4500.0)
  (setq borderJoinTol 15.0)
  (setq parallelGap 2.0)
  (setq borderFrameLw 0)
  (setq borderFrameLine 0)
  (setq borderLineSkip 0)
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
      ;; v2.29: 닫힌 4변 거의-직사각형(텍스트 테두리)은 후보에 넣지 않는다.
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
       (if (cad2-isTextBorderLwpoly dxf verts frameMaxSide)
         (setq borderFrameLw (1+ borderFrameLw))
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
    )
    (setq i (1+ i))
  )

  ;; 3-0. v2.29: LINE 테두리(v2.25식 4선 직사각 + 이중 평행변 gap≤2만)를 지시선 후보에서 제외.
  ;;      4~8선 클러스터·박스둘레 양끝 LINE 제외는 하지 않는다(정상 지시선 보존).
  (setq textBoxes '())
  (foreach tc textCandidates
    (if (and (nth 4 tc) (nth 5 tc))
      (setq textBoxes (cons (list (nth 4 tc) (nth 5 tc)) textBoxes))
    )
  )
  (setq borderFilter
    (cad2-filterRectBorderLines lineList borderJoinTol frameMaxSide
                                parallelGap textBoxes))
  (setq lineList (car borderFilter))
  (setq borderLineSkip (cadr borderFilter))
  (setq borderFrameLine (caddr borderFilter))

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

  ;; 4~5. v2.29 핵심 매칭 — v2.28/v2.24식 단순 골격
  ;;   (1) TEXT 실제 바운딩박스 → 가장 가까운 지시선 끝점(=텍스트쪽)
  ;;   (2) 그 반대쪽 끝점만 → 같은 Layer CIRCLE
  ;;   (3) 텍스트쪽 거리 + 원쪽 연결거리로 품질점수 → 텍스트/원/선 1:1 그리디
  ;;   (4) 그리디 후 가벼운 2-스왑·애매/교차 의심만 주황 표시
  ;; away-leader / 박스둘레 양끝 스킵 / 4~8선 과필터 없음.
  ;; v2.18의 "아무 LINE 최근접" 방식은 사용하지 않는다.
  (setq attachTol 400.0)
  (setq maxDist 3500.0)
  (setq circleWeight 1.20)
  (setq ambMargin 80.0)
  (setq pairList '())

  ;; pair 형식:
  ;; (품질점수 텍스트→선끝거리 반대끝→원거리 텍스트인덱스 원중심 선인덱스)
  ;; 품질점수 = 텍스트거리 + circleWeight * 원연결거리
  (setq idxT 0)
  (foreach txtItem textList
    (setq boxPt (nth 1 txtItem))
    (setq idxL 0)

    (foreach ln lineList
      (setq p1 (car ln))
      (setq p2 (cadr ln))
      (setq layerName (caddr ln))
      (setq lnLen (distance p1 p2))

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

          (if (and (nth 3 txtItem) (nth 4 txtItem))
            (setq farBoxDist (distPtToBox farEnd (nth 3 txtItem) (nth 4 txtItem)))
            (setq farBoxDist (distance boxPt farEnd))
          )

          ;; ★ 2단계: 반드시 반대쪽 끝에서만 같은 Layer CIRCLE을 찾는다.
          (setq a1 (nearestCircleDistWithinTol farEnd circleList attachTol layerName))

          (if a1
            (progn
              (setq circleDist (car a1))
              (setq matchedCircle (cdr a1))
              (setq pairScore (+ curDist (* circleWeight circleDist)))
              ;; 원쪽이 글자에서 멀수록(지시선이 뚜렷할수록) 소폭 가산점
              (setq pairScore (- pairScore (* 0.05 (max 0.0 (- farBoxDist curDist)))))

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

  (if (or (> borderFrameLw 0) (> borderFrameLine 0))
    (princ (strcat "\n[진단] 텍스트 테두리 제외(v2.29 v2.25네모+이중변): LWPOLY "
                   (itoa borderFrameLw) "개, LINE프레임/이중변 "
                   (itoa borderFrameLine) "개(선 "
                   (itoa borderLineSkip) "개) — 지시선 후보에서만 제외"))
  )

  (if (> lwPolyCount 0)
    (princ (strcat "\n[진단] LWPOLYLINE " (itoa lwPolyCount)
                   "개 선택됨(테두리 네모 제외 후 나머지 첫·끝 정점을 지시선 후보에 포함)"))
  )

  ;; ★ 4단계: 품질점수 순으로 1:1 배정.
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
        ;; (텍스트인덱스 원중심 선인덱스 품질점수)
        (setq circleAssign (cons (list ti matchedCircle idxL (car pr)) circleAssign))
      )
    )
  )

  ;; ★ 4b. v2.29(=v2.28) 가벼운 2-스왑: A↔B 맞바꿈이 점수 합을 낮추면 적용(한 패스)
  (setq newAssign '())
  (foreach asgA circleAssign
    (foreach asgB circleAssign
      (setq tiA (car asgA) circA (nth 1 asgA))
      (setq tiB (car asgB) circB (nth 1 asgB))
      (if (< tiA tiB)
        (progn
          (setq sAC (cad2-bestPairScoreFor pairList tiA circA))
          (setq sBD (cad2-bestPairScoreFor pairList tiB circB))
          (setq sAD (cad2-bestPairScoreFor pairList tiA circB))
          (setq sBC (cad2-bestPairScoreFor pairList tiB circA))
          (if (and sAC sBD sAD sBC
                   (< (+ sAD sBC) (+ sAC sBD)))
            (setq newAssign
              (cons (list tiA tiB circB circA sAD sBC) newAssign))
          )
        )
      )
    )
  )
  ;; 겹치지 않는 스왑만 앞에서부터 적용
  (setq usedTextIdx '())
  (foreach asgA (reverse newAssign)
    (setq tiA (nth 0 asgA) tiB (nth 1 asgA))
    (setq circB (nth 2 asgA) circA (nth 3 asgA))
    (setq sAD (nth 4 asgA) sBC (nth 5 asgA))
    (if (and (not (member tiA usedTextIdx)) (not (member tiB usedTextIdx)))
      (progn
        (setq usedTextIdx (cons tiA (cons tiB usedTextIdx)))
        (setq asgB '())
        (foreach asgX circleAssign
          (cond
            ((= (car asgX) tiA)
             (setq asgB (cons (list tiA circB (nth 2 asgX) sAD) asgB)))
            ((= (car asgX) tiB)
             (setq asgB (cons (list tiB circA (nth 2 asgX) sBC) asgB)))
            (T (setq asgB (cons asgX asgB)))
          )
        )
        (setq circleAssign (reverse asgB))
      )
    )
  )
  (if usedTextIdx
    (princ (strcat "\n[진단] 교차 배정 2-스왑 보정 "
                   (itoa (/ (length usedTextIdx) 2)) "쌍 적용"))
  )

  ;; ★ 4c. 애매 배정·잔여 교차 스왑 의심 → 주황(색만, 배정은 유지)
  (setq ambiguousIdx '())
  (foreach asgA circleAssign
    (setq tiA (car asgA))
    (setq circA (nth 1 asgA))
    (setq bestSc (nth 3 asgA))
    (setq secondSc nil)
    (foreach pr pairList
      (if (and (= (nth 3 pr) tiA) (not (cad2-samePt (nth 4 pr) circA)))
        (if (or (null secondSc) (< (car pr) secondSc))
          (setq secondSc (car pr))
        )
      )
    )
    (if (and bestSc secondSc (< (- secondSc bestSc) ambMargin))
      (if (not (member tiA ambiguousIdx))
        (setq ambiguousIdx (cons tiA ambiguousIdx))
      )
    )
  )
  ;; A가 B의 최근접 원을, B가 A의 최근접 원을 가진 교차 패턴
  (foreach asgA circleAssign
    (foreach asgB circleAssign
      (setq tiA (car asgA) circA (nth 1 asgA))
      (setq tiB (car asgB) circB (nth 1 asgB))
      (if (< tiA tiB)
        (progn
          (setq nearA (cad2-nearestCircByTextDist pairList tiA))
          (setq nearB (cad2-nearestCircByTextDist pairList tiB))
          (if (and nearA nearB
                   (cad2-samePt nearA circB)
                   (cad2-samePt nearB circA))
            (progn
              (if (not (member tiA ambiguousIdx))
                (setq ambiguousIdx (cons tiA ambiguousIdx)))
              (if (not (member tiB ambiguousIdx))
                (setq ambiguousIdx (cons tiB ambiguousIdx)))
            )
          )
        )
      )
    )
  )

  (setq ambiguousList '())
  (foreach ti ambiguousIdx
    (setq txtItem (nth ti textList))
    (if txtItem
      (progn
        (setq ambiguousList (cons (nth 0 txtItem) ambiguousList))
        (entmod (list (cons -1 (nth 2 txtItem)) (cons 62 30)))
        (entupd (nth 2 txtItem))
      )
    )
  )
  (if ambiguousList
    (princ (strcat "\n[진단] 애매/교차 의심 배정 " (itoa (length ambiguousList))
                   "개 → 주황 표시(핀은 유지, 수동 확인)"))
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
      (setq bestTip (nth 1 assigned))
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
  (write-line "  \"version\": \"2.29_v25_rect_plus_double_edge\"," f)
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

  ;; 애매/교차 의심(배정은 됐지만 침묵 오핀 가능) 안내
  (setq ambiguousMsg "")
  (if ambiguousList
    (progn
      (setq ambiguousMsg (strcat "\n\n⚠ " (itoa (length ambiguousList)) "개 결함은 원에 배정됐지만 애매하거나 교차 스왑 의심이라 주황으로 표시했습니다.\n앱에서 자리가 바뀌어 보일 수 있으니 캐드에서 확인해주세요.\n대상 번호: "))
      (setq firstItem T)
      (foreach n ambiguousList
        (if (not firstItem) (setq ambiguousMsg (strcat ambiguousMsg ", ")))
        (setq ambiguousMsg (strcat ambiguousMsg n))
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
                 (itoa (length uncertainList)) "개, 애매/교차의심(주황) "
                 (itoa (length ambiguousList)) "개"))

  (alert (strcat "총 " (itoa (length jsonList)) "개의 결함(비결함 텍스트 제외 완료)과 기준점 2개를 추출했습니다!\n\n저장 경로:\n" outPath "\n\n이제 스마트 안전점검 앱에서 [📐 캐드 핀 가져오기]를 누르고 2개 기준점을 클릭해 주세요."
    (if (> dupCircleCount 0)
      (strcat "\n\n⚠ 같은 자리에 겹쳐 그려진 원 " (itoa dupCircleCount) "개를 발견해서 마젠타(분홍/자주) 색으로 표시해뒀습니다.\n도면에서 마젠타색 원을 찾아 확인 후, 진짜 위치로 옮기거나 필요없으면 지워주세요.")
      ""
    )
    dupMissingMsg
    uncertainMsg
    ambiguousMsg
  ))
  (princ (strcat "\n[CAD2APP v2.29] 추출 완료! 파일 경로: " outPath "\n"))
  (princ)
)

(princ "\n[CAD2APP v2.29] 로드 완료. 캐드 명령창에 CAD2APP 을 입력하세요.\n")
(princ)