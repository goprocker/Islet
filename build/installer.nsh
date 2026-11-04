; Phone drop listens on a random port, so the rule allows Islet.exe itself.
; The installer runs per machine (elevated), so netsh can add it directly.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Islet Phone drop"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Islet Phone drop" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=private'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Islet Phone drop"'
!macroend
