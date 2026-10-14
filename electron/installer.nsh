; Program Files 에 깔린 앱만 끈다.
; 설치 파일 폴더까지 끄면 설치 창이 뜨기 전에 사라진다.
!macro bsaForceKillApp
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -EncodedCommand RwBlAHQALQBDAGkAbQBJAG4AcwB0AGEAbgBjAGUAIABXAGkAbgAzADIAXwBQAHIAbwBjAGUAcwBzACAAfAAgAD8AIAB7ACAAJABwAD0AJABfAC4ARQB4AGUAYwB1AHQAYQBiAGwAZQBQAGEAdABoADsAIAAkAHAAIAAtAGwAaQBrAGUAIAAnAEMAOgBcAFAAcgBvAGcAcgBhAG0AIABGAGkAbABlAHMAXABiAHUAaQBsAGQAaQBuAGcALQBzAGEAZgBlAHQAeQAtAGEAcABwAFwAKgAnACAALQBvAHIAIAAkAHAAIAAtAGwAaQBrAGUAIAAnAEMAOgBcAFAAcgBvAGcAcgBhAG0AIABGAGkAbABlAHMAIAAoAHgAOAA2ACkAXABiAHUAaQBsAGQAaQBuAGcALQBzAGEAZgBlAHQAeQAtAGEAcABwAFwAKgAnACAAfQAgAHwAIAAlACAAewAgAFMAdABvAHAALQBQAHIAbwBjAGUAcwBzACAALQBJAGQAIAAkAF8ALgBQAHIAbwBjAGUAcwBzAEkAZAAgAC0ARgBvAHIAYwBlACAALQBFAEEAIAAwACAAfQA=`
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
