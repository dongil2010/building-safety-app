; Program Files 에 깔린 앱이 파일을 잡고 있으면 설치가 실패한다.
; 질문을 띄우다 아니오를 누르면 설치 자체가 끝나므로, 여기서는 앱만 닫고 설치는 계속한다.
!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!macro bsaForceKillApp
  nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $0
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Stop-Process -Name '스마트 안전점검' -Force -ErrorAction SilentlyContinue"`
  Pop $0
  Sleep 1500
!macroend

!macro customInit
  !insertmacro bsaForceKillApp
!macroend

!macro customCheckAppRunning
  !insertmacro bsaForceKillApp
!macroend
