;;; =========================================================================
;;;  CAD to Smart Safety App - 결함위치도 2점 정밀 캘리브레이션 추출기
;;;  버전: v2.0 (2-Point Calibration + 지시선 자동 탐색)
;;; =========================================================================

(defun c:CAD2APP ( / pt1 pt2 ss i ent dxf entType no boxPt tipPt
                     textList leaderList lineList jsonList outPath f
                     minDist bestTip curDist p1 p2 d1 d2 firstItem )
  (vl-load-com)
  (princ "\n=======================================================")
  (princ "\n  [CAD2APP v2.0] 스마트 안전점검 - 2점 정밀 캘리브레이션 추출기")
  (princ "\n=======================================================")

  ;; 1. 기준점 2개 지정 (도면 상의 명확한 기둥 2개)
  (setq pt1 (getpoint "\n[1/3] 첫 번째 기준점 (예: 좌측/상단 기둥 중심)을 클릭하세요: "))
  (if (null pt1) (progn (princ "\n취소되었습니다.") (exit)))
  (setq pt2 (getpoint pt1 "\n[2/3] 두 번째 기준점 (예: 우측/하단 기둥 중심)을 클릭하세요: "))
  (if (null pt2) (progn (princ "\n취소되었습니다.") (exit)))

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

  ;; 3. 객체 분류 (다중지시선, 텍스트, 지시선, 일반선)
  (while (< i (sslength ss))
    (setq ent (ssname ss i))
    (setq dxf (entget ent))
    (setq entType (cdr (assoc 0 dxf)))

    (cond
      ;; (A) MULTILEADER (자체 텍스트 + 화살표 일체형)
      ((= entType "MULTILEADER")
       (setq vlaObj (vlax-ename->vla-object ent))
       (setq no (vlax-get-property vlaObj 'TextString))
       (setq tipPt (vlax-safearray->list (vlax-variant-value (vla-GetLeaderLineVertices vlaObj 0))))
       (setq tipPt (list (car tipPt) (cadr tipPt)))
       (setq boxPt (vlax-safearray->list (vlax-variant-value (vlax-get-property vlaObj 'TextPosition))))
       (setq boxPt (list (car boxPt) (cadr boxPt)))
       (if (and tipPt boxPt no)
         (setq jsonList (cons (list no boxPt tipPt) jsonList))
       )
      )

      ;; (B) TEXT / MTEXT
      ((or (= entType "TEXT") (= entType "MTEXT"))
       (setq no (cdr (assoc 1 dxf)))
       (setq boxPt (cdr (assoc 10 dxf)))
       (if (and no boxPt)
         (setq textList (cons (list no (list (car boxPt) (cadr boxPt))) textList))
       )
      )

      ;; (C) LEADER
      ((= entType "LEADER")
       (setq vlaObj (vlax-ename->vla-object ent))
       (setq coords (vlax-safearray->list (vlax-variant-value (vlax-get-property vlaObj 'Coordinates))))
       (if (>= (length coords) 6)
         ;; 첫 번째 정점이 화살표 끝, 마지막 정점이 문자 쪽
         (setq leaderList (cons (list (list (nth 0 coords) (nth 1 coords))
                                      (list (nth (- (length coords) 3) coords) (nth (- (length coords) 2) coords)))
                                leaderList))
       )
      )

      ;; (D) 일반 LINE
      ((= entType "LINE")
       (setq p1 (cdr (assoc 10 dxf)))
       (setq p2 (cdr (assoc 11 dxf)))
       (setq lineList (cons (list (list (car p1) (cadr p1)) (list (car p2) (cadr p2))) lineList))
      )
    )
    (setq i (1+ i))
  )

  ;; 4. 독립 텍스트와 가장 가까운 지시선/선 매칭
  (foreach txtItem textList
    (setq no (nth 0 txtItem))
    (setq boxPt (nth 1 txtItem))
    (setq bestTip boxPt)
    (setq minDist 100000000.0)

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

    (setq jsonList (cons (list no boxPt bestTip) jsonList))
  )

  (if (null jsonList)
    (progn (alert "추출할 수 있는 결함 번호가 없습니다.") (exit))
  )

  ;; 5. JSON 파일 저장
  (setq outPath (strcat (getenv "USERPROFILE") "\\Desktop\\cad_defects_import.json"))
  (setq f (open outPath "w"))
  (write-line "{" f)
  (write-line "  \"source\": \"AutoCAD\"," f)
  (write-line "  \"version\": \"2.0_calibrated\"," f)
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
    (setq no (nth 0 item))
    (setq no (vl-string-translate "\"\r\n\\" "    " no))
    (setq boxPt (nth 1 item))
    (setq tipPt (nth 2 item))

    (if (not firstItem) (write-line "    ," f))
    (setq firstItem nil)

    (write-line "    {" f)
    (write-line (strcat "      \"no\": \"" (vl-string-trim " " no) "\",") f)
    (write-line (strcat "      \"cadBoxX\": " (rtos (car boxPt) 2 4) ",") f)
    (write-line (strcat "      \"cadBoxY\": " (rtos (cadr boxPt) 2 4) ",") f)
    (write-line (strcat "      \"cadTipX\": " (rtos (car tipPt) 2 4) ",") f)
    (write-line (strcat "      \"cadTipY\": " (rtos (cadr tipPt) 2 4)) f)
    (write-line "    }" f)
  )

  (write-line "  ]" f)
  (write-line "}" f)
  (close f)

  (alert (strcat "총 " (itoa (length jsonList)) "개의 결함(지시선 포함)과 기준점 2개를 추출했습니다!\n\n저장 경로:\n" outPath "\n\n스마트 안전점검 앱에서 [📐 캐드 핀 가져오기]를 누르고, 방금 클릭한 2개 기준점을 순서대로 클릭하면 100% 오차 없이 정확히 배치됩니다."))
  (princ (strcat "\n[CAD2APP] 추출 완료! 파일 경로: " outPath "\n"))
  (princ)
)

(princ "\n[CAD2APP v2.0] 로드 완료. 캐드 명령창에 CAD2APP 을 입력하세요.\n")
(princ)