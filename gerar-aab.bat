@echo off
REM ===== MGPLAY - gera o arquivo .AAB para enviar a Play Store =====
REM Na primeira vez, responda "Yes" quando perguntar se quer gerar a chave (keystore).
REM A Expo guarda essa chave para voce. NAO apague o projeto na Expo.
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando as dependencias - so na primeira vez, pode demorar alguns minutos...
  call npm install --legacy-peer-deps
)
call npx eas-cli@latest login

call npx eas-cli@latest build -p android --profile production
echo.
echo Quando terminar, baixe o arquivo .aab pelo link e envie no Play Console.
pause
