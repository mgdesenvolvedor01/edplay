@echo off
REM ===== MGPLAY - gera um APK de TESTE na nuvem da Expo =====
REM Na primeira vez ele pede para entrar na sua conta Expo (gratis em https://expo.dev)
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando as dependencias - so na primeira vez, pode demorar alguns minutos...
  call npm install --legacy-peer-deps
)
call npx eas-cli@latest login

call npx eas-cli@latest build -p android --profile preview
echo.
echo Quando terminar, a Expo mostra um link/QR Code para baixar o APK.
pause
