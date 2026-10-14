; 업데이트면 확인 한 번만 받고, 제거 전에 실행 중인 앱을 강제 종료한다.
; 설치 위치는 Program Files 라서 관리자 권한 설치(perMachine)에서 파일을 덮어쓴다.
!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!macro bsaForceKillApp
  nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $0
  ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $0
  ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $0
  Sleep 700
!macroend

!macro customInit
  StrCpy $R9 "0"
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R8
  ${if} $R8 == 0
    StrCpy $R9 "1"
  ${endIf}
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

!macro customCheckAppRunning
  StrCpy $R7 0
  bsaKillLoop:
    IntOp $R7 $R7 + 1
    !insertmacro bsaForceKillApp
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R8
    ${if} $R8 == 0
    ${andIf} $R7 < 6
      Goto bsaKillLoop
    ${endIf}
!macroend
