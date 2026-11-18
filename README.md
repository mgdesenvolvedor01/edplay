# MGPLAY — App (celular, TV Box e Android TV)

App em React Native + Expo. Funciona no celular e na TV com controle remoto.

## O que o app faz
- Na primeira vez que abre, registra o aparelho no seu painel (MAC + Chave) e libera o teste grátis.
- Se o aparelho não estiver ativo, mostra a tela de ativação: MAC, Chave, botão do WhatsApp e "Tenho um código".
- O cliente entra só com **usuário e senha Xtream**. O endereço do servidor vem do painel.
- TV ao vivo (com guia de programação), Filmes, Séries, Busca, Favoritos e "Continuar assistindo".
- Recebe do painel: cores, logo, banners, avisos, modo manutenção e aviso de atualização.

## Antes de gerar
O app já aponta para o painel em `https://mgplaypainel.netlify.app/api/app` (arquivo `src/config.ts`).
Publique o painel antes (pasta `painel-netlify`, arquivo `publicar-painel.bat`).

## Gerar o app (Windows, sem Android Studio)
1. Instale o **Node.js LTS**: https://nodejs.org
2. Crie uma conta grátis em https://expo.dev
3. Dê dois cliques em **`instalar.bat`** e espere terminar.
4. Para um **APK de teste** (instalar direto no celular/TV Box): **`gerar-apk.bat`**
5. Para a **Play Store** (arquivo .aab): **`gerar-aab.bat`**

A compilação acontece na nuvem da Expo e leva de 10 a 30 minutos. No fim aparece um link para baixar.

> Na primeira compilação, a Expo pergunta se pode gerar a **chave de assinatura (keystore)**. Responda **Yes**. Ela fica guardada na sua conta Expo e é usada em todas as atualizações. Não apague o projeto lá.

## Publicar uma atualização
Em `app.config.js`, aumente `version` (ex.: `1.0.1`) e `versionCode` (ex.: `2`). Depois rode `gerar-aab.bat` de novo.

## Dados técnicos
- Pacote: `com.mgplay.app`
- targetSdk 36 (exigência atual da Play Store)
- Player: expo-video (ExoPlayer/Media3): HLS (.m3u8), MPEG-TS, MP4 e MKV
- Android TV: categoria LEANBACK e banner 320×180 adicionados por `plugins/withAndroidTV.js`
