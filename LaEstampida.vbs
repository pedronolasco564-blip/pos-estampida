Set objFSO = CreateObject("Scripting.FileSystemObject")
ruta = objFSO.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")

' 1. Establecer el directorio de trabajo (para que no se pierda la base de datos)
WshShell.CurrentDirectory = ruta

' 2. Arrancar tu servidor de Node.js en MODO INVISIBLE (el 0 significa oculto)
WshShell.Run "cmd.exe /c iniciar_sistema.bat", 0, False


' 3. Abrir la pantalla de carga usando Edge con impresión silenciosa activada
WshShell.Run "msedge.exe --kiosk-printing --app=""file:///" & ruta & "\splash.html"" --window-size=450,550", 1, False