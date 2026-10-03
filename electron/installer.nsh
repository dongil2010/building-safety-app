!macro customInit
  ${IfNot} ${UAC_IsInnerInstance}
    ${if} $hasPerUserInstallation == "1"
    ${orIf} $hasPerMachineInstallation == "1"
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_TOPMOST "업데이트 하시겠습니까?" IDYES bsaUpdateYes
      Quit
      bsaUpdateYes:
      nsExec::Exec `taskkill /f /im "${APP_EXECUTABLE_FILENAME}"`
      Pop $0
      Sleep 800
    ${endIf}
  ${EndIf}
!macroend
