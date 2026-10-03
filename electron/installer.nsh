; 업데이트면 확인 한 번만 받고, 제거 전에 실행 중인 앱을 강제 종료한다.
; 관리자로 다시 뜨는 설치 프로세스에서도 같은 이름으로 죽인다.
!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!define BSA_APP_IMAGE "스마트 안전점검.exe"

!macro bsaForceKillApp
  ExecWait '"$SYSDIR\taskkill.exe" /F /T /IM "${BSA_APP_IMAGE}"' $0
  nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "${BSA_APP_IMAGE}"`
  Pop $0
  ${nsProcess::KillProcess} "${BSA_APP_IMAGE}" $0
  nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ${BSA_APP_IMAGE}" /FO csv | "$SYSDIR\find.exe" "${BSA_APP_IMAGE}"`
  Pop $0
  ${if} $0 == 0
    nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "${BSA_APP_IMAGE}" /FI "USERNAME eq %USERNAME%"`
    Pop $0
    ${nsProcess::KillProcess} "${BSA_APP_IMAGE}" $0
  ${endIf}
  Sleep 1500
!macroend

!macro bsaNoteExistingInstall
  StrCpy $R9 "0"
  ${if} $hasPerUserInstallation == "1"
  ${orIf} $hasPerMachineInstallation == "1"
    StrCpy $R9 "1"
  ${endIf}
  ${nsProcess::FindProcess} "${BSA_APP_IMAGE}" $R8
  ${if} $R8 == 0
    StrCpy $R9 "1"
  ${endIf}
!macroend

!macro customInit
  !insertmacro bsaNoteExistingInstall
  ${If} ${UAC_IsInnerInstance}
    ${if} $R9 == "1"
      !insertmacro bsaForceKillApp
    ${endIf}
  ${Else}
    ${if} $R9 == "1"
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_TOPMOST "업데이트 하시겠습니까?" IDYES bsaUpdateYes
      Quit
      bsaUpdateYes:
      !insertmacro bsaForceKillApp
    ${endIf}
  ${EndIf}
!macroend

; 설치 구간 기본 로직은 닫기 확인을 못 넘기면 영문 appCannotBeClosed 를 띄운다.
; 그 전에 같은 이미지 이름으로 한 번 더 강제 종료한다.
!macro customCheckAppRunning
  !insertmacro bsaForceKillApp
!macroend
