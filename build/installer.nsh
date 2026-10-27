; Abre el puerto del POS en el Firewall de Windows para que los celulares de los meseros puedan conectarse.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="POS La Estampida"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="POS La Estampida" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=private,public'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="POS La Estampida"'
!macroend
