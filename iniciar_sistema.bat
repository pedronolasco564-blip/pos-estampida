@echo off
:: Fuerza a Windows a ubicarse en la carpeta correcta
cd /d "%~dp0"

title Servidor POS - Asadero La Estampida
color 0A

echo =======================================================
echo        SISTEMA DE PUNTO DE VENTA - LA ESTAMPIDA
Echo ===============by OswaldoNLDev04=======================
echo =======================================================
echo.
echo Arrancando el motor del sistema...
echo.
echo *** IMPORTANTE ***
echo NO cierre esta ventana negra durante el turno de trabajo.
echo Si la cierra, los meseros perderan la conexion.
echo Puede minimizarla si le estorba en la pantalla.
echo ******************
echo Direccion ip :192.168.18.101
echo.



node server.js

pause