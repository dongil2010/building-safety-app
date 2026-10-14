; 업데이트면 확인 한 번만 받고, Program Files 를 덮기 전에 실행 중인 앱을 끈다.
; 관리자로 다시 뜬 설치에서도 설치 폴더의 프로세스를 죽인다.
!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!macro bsaForceKillApp
  nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $0
  ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $0
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -EncodedCommand RwBlAHQALQBDAGkAbQBJAG4AcwB0AGEAbgBjAGUAIABXAGkAbgAzADIAXwBQAHIAbwBjAGUAcwBzACAAfAAgAFcAaABlAHIAZQAtAE8AYgBqAGUAYwB0ACAAewAgACQAXwAuAEUAeABlAGMAdQB0AGEAYgBsAGUAUABhAHQAaAAgAC0AbABpAGsAZQAgACcAKgBiAHUAaQBsAGQAaQBuAGcALQBzAGEAZgBlAHQAeQAtAGEAcABwACoAJwAgAH0AIAB8ACAARgBvAHIARQBhAGMAaAAtAE8AYgBqAGUAYwB0ACAAewAgAFMAdABvAHAALQBQAHIAbwBjAGUAcwBzACAALQBJAGQAIAAkAF8ALgBQAHIAbwBjAGUAcwBzAEkAZAAgAC0ARgBvAHIAYwBlACAALQBFAHIAcgBvAHIAQQBjAHQAaQBvAG4AIABTAGkAbABlAG4AdABsAHkAQwBvAG4AdABpAG4AdQBlACAAfQA7ACAARwBlAHQALQBQAHIAbwBjAGUAcwBzACAAfAAgAFcAaABlAHIAZQAtAE8AYgBqAGUAYwB0ACAAewAgACQAXwAuAFAAcgBvAGMAZQBzAHMATgBhAG0AZQAgAC0AbABpAGsAZQAgACcAKgBIxQTIEMiArCoAJwAgAH0AIAB8ACAAUwB0AG8AcAAtAFAAcgBvAGMAZQBzAHMAIAAtAEYAbwByAGMAZQAgAC0ARQByAHIAbwByAEEAYwB0AGkAbwBuACAAUwBpAGwAZQBuAHQAbAB5AEMAbwBuAHQAaQBuAHUAZQA=`
  Pop $0
  Sleep 1200
!macroend

!macro customInit
  ${If} ${UAC_IsInnerInstance}
    !insertmacro bsaForceKillApp
  ${Else}
    StrCpy $R9 "0"
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R8
    ${if} $R8 == 0
      StrCpy $R9 "1"
    ${endIf}
    ${if} $R9 == "1"
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_TOPMOST "업데이트 하시겠습니까?$\r$\n관리자 권한 창이 나오면 예를 누르세요." IDYES bsaUpdateYes
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
