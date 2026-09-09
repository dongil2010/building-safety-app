;;; =========================================================================
;;;  CAD to Smart Safety App - 결함위치도 2점 정밀 캘리브레이션 추출기
;;;  버전: v2.1 (MTEXT 포맷 제거 + 비결함 텍스트 제외 + 지시선 정밀 매칭)
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
                     textList leaderList lineList jsonList outPath f
                     minDist bestTip curDist p1 p2 d1 d2 firstItem maxDist )
  (vl-load-com)
  (princ "\n=======================================================")
  (princ "\n  [CAD2APP v2.1] 스마트 안전점검 - 결함 번호/지시선 정밀 추출기")
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

  ;; 2. 결함 객체들 선택
  (princ "\n[3/3] 도면 상의 결함 핀/문자/지시선들을 드래그로 선택하세요: ")
  (setq ss (ssget '((0 . "MULTILEADER,LEADER,MTEXT,TEXT,LINE,LWPOLYLINE"))))
  (if (null ss)
    (progn (princ "\n선택된 객체가 없습니다.") (exit))
  )

  (setq textList '())
  (setq leaderList '())
  (setq lineList '())
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
    )
    (setq i (1+ i))
  )

  ;; 4. 독립 텍스트와 주변 지시선 매칭 (최대 탐색 반경 3500mm)
  (setq maxDist 3500.0)
  (foreach txtItem textList
    (setq cleanNo (nth 0 txtItem))
    (setq boxPt (nth 1 txtItem))
    (setq bestTip boxPt)
    (setq minDist maxDist)

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
  (write-line "  \"version\": \"2.1_clean\"," f)
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
  (princ (strcat "\n[CAD2APP v2.1] 추출 완료! 파일 경로: " outPath "\n"))
  (princ)
)

(princ "\n[CAD2APP v2.1] 로드 완료. 캐드 명령창에 CAD2APP 을 입력하세요.\n")
(princ)