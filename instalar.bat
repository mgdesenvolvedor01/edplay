@echo off
REM ===== MGPLAY - instala as bibliotecas do app (Windows) =====
REM Precisa do Node.js instalado: https://nodejs.org (versao LTS)
cd /d "%~dp0"
call npm install
echo.
echo Pronto! Agora rode:  gerar-apk.bat   (APK de teste)
echo                ou:   gerar-aab.bat   (arquivo para a Play Store)
pause
