import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '../theme';

/**
 * Prévia ao vivo embutida (sem controles). Troca de canal sem recriar o player.
 * Se o .m3u8 falhar, tenta o .ts uma vez.
 */
export function LivePreview({ url, fallbackUrl, paused = false, headers }: { url: string | null; fallbackUrl?: string | null; paused?: boolean; headers?: Record<string, string> }) {
  const t = useTheme();
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const triedFallback = useRef(false);
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    const sub = player.addListener('statusChange', (e: { status: string }) => {
      if (e.status === 'readyToPlay') setState('ready');
      else if (e.status === 'loading') setState((s) => (s === 'ready' ? s : 'loading'));
      else if (e.status === 'error') {
        if (fallbackUrl && !triedFallback.current) {
          triedFallback.current = true;
          load(fallbackUrl);
        } else setState('error');
      }
    });
    return () => sub.remove();
  }, [player, fallbackUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = (u: string) => {
    const src = { uri: u, headers: headers || { 'User-Agent': 'EDPLAY/1.0' } };
    const p: any = player;
    setState('loading');
    player.muted = false;
    Promise.resolve(p.replaceAsync ? p.replaceAsync(src) : p.replace(src))
      .then(() => player.play())
      .catch(() => setState('error'));
  };

  useEffect(() => {
    triedFallback.current = false;
    if (url && !paused) load(url);
    else {
      // sem canal ou tela cheia aberta: para o vídeo e o áudio da prévia por completo
      player.pause();
      player.muted = true;
      const p: any = player;
      Promise.resolve(p.replaceAsync ? p.replaceAsync(null) : p.replace(null)).catch(() => {});
      setState('idle');
    }
  }, [url, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // pausa ao sair da tela
  useEffect(() => () => player.pause(), [player]);

  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: t.line }}>
      <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls={false} contentFit="contain" allowsPictureInPicture={false} />
      {state !== 'ready' ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 8 }]} pointerEvents="none">
          {state === 'loading' ? <ActivityIndicator color={t.primary} size="large" /> : null}
          <Text style={{ color: '#bbb', fontSize: 13 }}>
            {state === 'idle' ? 'Escolha um canal para assistir aqui' : state === 'error' ? 'Canal indisponível no momento' : 'Carregando…'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
