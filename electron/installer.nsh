; 실행 중인 스마트 안전점검이 설치 파일을 잡고 있으면
; "cannot be closed" 창이 뜬다. 한글 프로세스 이름은 여기서 깨지므로
; 설치 폴더 경로로 프로세스를 끈다.
; 이미 깔린 제거 프로그램도 같은 이유로 실패하므로, 제거는 건너뛰고 파일을 덮는다.
!macro bsaForceKillApp
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -EncodedCommand RwBlAHQALQBDAGkAbQBJAG4AcwB0AGEAbgBjAGUAIABXAGkAbgAzADIAXwBQAHIAbwBjAGUAcwBzACAAfAAgAD8AIAB7ACAAJABfAC4ARQB4AGUAYwB1AHQAYQBiAGwAZQBQAGEAdABoACAALQBsAGkAawBlACAAJwAqAGIAdQBpAGwAZABpAG4AZwAtAHMAYQBmAGUAdAB5AC0AYQBwAHAAKgAnACAAfQAgAHwAIAAlACAAewAgAFMAdABvAHAALQBQAHIAbwBjAGUAcwBzACAALQBJAGQAIAAkAF8ALgBQAHIAbwBjAGUAcwBzAEkAZAAgAC0ARgBvAHIAYwBlACAALQBFAEEAIAAwACAAfQA=`
  Pop $0
  Sleep 1500
!macroend

!macro customInit
  !insertmacro bsaForceKillApp
!macroend

!macro customCheckAppRunning
  !insertmacro bsaForceKillApp
  ClearErrors
  DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ClearErrors
!macroend
