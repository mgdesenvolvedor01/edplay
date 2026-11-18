import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Focusable } from '../components/ui';
import type { PlayItem, ScreenProps } from '../navigation';
import { useXtream } from '../session';
import { getPrefs, saveLastChannel, saveProgress, savePrefs } from '../storage';
import { measureSpeed, NEED_MBPS } from '../speed';
import { useTheme } from '../theme';

type Variant = { id: number; name: string; icon?: string; rank: number; label: string };

/** Nome do canal sem as marcas de qualidade (HD, FHD, SD, 4K...) para achar as outras versões do mesmo canal */
function baseName(n: string) {
  return n
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b(4k|uhd|fhd|full\s?hd|hd|sd|h\.?26[45]|hevc|1080p?|720p?|480p?|[56]0\s?fps)\b/g, ' ')
    .replace(/[^a-z0-9\u00e0-\u00fa]+/g, ' ')
    .trim();
}
function qualityOf(n: string): { rank: number; label: string } {
  const l = n.toLowerCase();
  if (/\b(4k|uhd)\b/.test(l)) return { rank: 4, label: '4K' };
  if (/\b(fhd|full\s?hd|1080p?)\b/.test(l)) return { rank: 3, label: 'FHD' };
  if (/\b(hd|720p?)\b/.test(l)) return { rank: 2, label: 'HD' };
  if (/\b(sd|480p?)\b/.test(l)) return { rank: 1, label: 'SD' };
  return { rank: 2, label: 'Padrão' };
}
// votos para SUBIR de qualidade (fica fora do componente: o player remonta a cada troca de canal)
const upVotes = { n: 0 };
const FIT_LABEL = { contain: 'Ajustar', cover: 'Preencher', fill: 'Esticar' } as const;
const FIT_NEXT = { contain: 'cover', cover: 'fill', fill: 'contain' } as const;

export default function PlayerScreen({ navigation, route }: ScreenProps<'Player'>) {
  // Remonta o player quando troca de canal/vídeo
  return <PlayerView key={route.params.url} item={route.params} onBack={() => navigation.goBack()} onReplace={(p) => navigation.setParams(p)} />;
}

function PlayerView({ item, onBack, onReplace }: { item: PlayItem; onBack: () => void; onReplace: (p: PlayItem) => void }) {
  useKeepAwake();
  const t = useTheme();
  const x = useXtream();
  const [url, setUrl] = useState(item.url);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [overlay, setOverlay] = useState(true);
  const triedTs = useRef(false);
  const seeked = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const headers: Record<string, string> = (x as any).headers || { 'User-Agent': 'EDPLAY/1.0' };
  const [fit, setFit] = useState<'contain' | 'cover' | 'fill'>(getPrefs().fit);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [notice, setNotice] = useState('');
  const stallTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stalls = useRef(0);
  const wasReady = useRef(false);

  const player = useVideoPlayer({ uri: url, headers }, (p) => {
    p.loop = false;
    p.play();
  });

  // Séries: próximo episódio (botão no topo + passa sozinho quando termina)
  const epList = item.episodes || [];
  const epIdx = item.kind === 'episode' ? epList.findIndex((e) => e.id === item.id) : -1;
  const nextEp = epIdx >= 0 ? epList[epIdx + 1] : undefined;
  const goNextEp = useRef<() => void>(() => {});
  goNextEp.current = () => {
    if (!nextEp) return;
    if (!item.noHistory) {
      // marca o atual como terminado: "Continuar" passa a apontar para o próximo
      const dur = player.duration || 1;
      saveProgress({ kind: 'episode', id: item.id, name: item.title, icon: item.icon, ext: item.ext || 'mp4', position: dur, duration: dur, seriesId: item.seriesId, updatedAt: Date.now() });
    }
    onReplace({ ...item, id: nextEp.id, title: nextEp.title, ext: nextEp.ext, url: x.episodeUrl(nextEp.id, nextEp.ext), startAt: 0 });
  };
  useEffect(() => {
    if (item.kind !== 'episode') return;
    const sub = player.addListener('playToEnd', () => goNextEp.current());
    return () => sub.remove();
  }, [player, item.kind]);

  // Estado do player: pronto / erro (com tentativa em .ts para canais ao vivo)
  useEffect(() => {
    const sub = player.addListener('statusChange', (e: { status: string; error?: { message?: string } }) => {
      if (e.status === 'readyToPlay') {
        wasReady.current = true;
        clearTimeout(stallTimer.current);
        setStatus('ready');
        if (!seeked.current && item.startAt && item.startAt > 5) {
          seeked.current = true;
          player.currentTime = Math.max(0, item.startAt - 3);
        }
      } else if (e.status === 'loading') {
        setStatus((s) => (s === 'ready' ? s : 'loading'));
        // travou no meio do canal (internet fraca)? depois de alguns segundos tenta uma qualidade menor
        if (wasReady.current && item.kind === 'live') {
          clearTimeout(stallTimer.current);
          stallTimer.current = setTimeout(() => {
            stalls.current += 1;
            lowerQuality.current?.(true);
          }, 7000);
        }
      } else if (e.status === 'error') {
        if (item.kind === 'live' && !triedTs.current) {
          triedTs.current = true;
          setUrl(x.liveUrl(item.id, 'ts'));
          return;
        }
        setErrorMsg(e.error?.message || '');
        setStatus('error');
      }
    });
    return () => {
      sub.remove();
      clearTimeout(stallTimer.current);
    };
  }, [player, item, x]);

  // Troca o arquivo quando caímos para .ts
  useEffect(() => {
    if (url !== item.url) {
      try {
        const src = { uri: url, headers };
        const p: any = player;
        Promise.resolve(p.replaceAsync ? p.replaceAsync(src) : p.replace(src)).then(() => player.play()).catch(() => setStatus('error'));
      } catch {
        setStatus('error');
      }
    }
  }, [url, item.url, player]);

  // Salva onde parou (filmes e episódios)
  useEffect(() => {
    if (item.kind === 'live') return;
    const save = () => {
      const position = player.currentTime || 0;
      const duration = player.duration || 0;
      if (position > 10 && !item.noHistory) {
        saveProgress({ kind: item.kind as 'movie' | 'episode', id: item.id, name: item.title, icon: item.icon, ext: item.ext || 'mp4', position, duration, seriesId: item.seriesId, updatedAt: Date.now() });
      }
    };
    const id = setInterval(save, 10000);
    return () => {
      clearInterval(id);
      save();
    };
  }, [player, item]);

  // Esconde os botões depois de alguns segundos
  const poke = () => {
    setOverlay(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOverlay(false), 5000);
  };
  useEffect(() => {
    poke();
    return () => clearTimeout(hideTimer.current);
  }, []);

  // Botão voltar do controle: se os botões estão escondidos, mostra primeiro
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!overlay) {
        poke();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [overlay]);

  // Outras versões do mesmo canal (HD, FHD, SD, 4K) achadas na lista que estava aberta (leve para TV simples)
  useEffect(() => {
    if (item.kind !== 'live') return;
    const all = item.channels || [];
    const me = all.find((c) => c.id === item.id);
    const base = baseName(me?.name || item.title);
    if (base.length < 2) return;
    const list: Variant[] = all
      .filter((c) => baseName(c.name) === base)
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon, ...qualityOf(c.name) }))
      .sort((a, b) => b.rank - a.rank);
    const seen = new Set<number>();
    const mine = list.find((v) => v.id === item.id);
    if (mine) seen.add(mine.rank);
    setVariants(list.filter((v) => (v.id === item.id ? true : !seen.has(v.rank) && !!seen.add(v.rank))));
  }, [item.id, item.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickVariant = (v: Variant, auto = false, up = false) => {
    if (auto) {
      setNotice(up ? `Internet boa: subindo para ${v.label}` : `Internet fraca: mudando para ${v.label}`);
      setTimeout(() => setNotice(''), 3500);
    }
    saveLastChannel(v.id, item.title, item.noHistory);
    onReplace({ ...item, id: v.id, url: x.liveUrl(v.id), title: item.title, icon: v.icon || item.icon });
  };
  const curVariant = variants.find((v) => v.id === item.id);
  const nextVariant = () => {
    if (variants.length < 2) return;
    const i = variants.findIndex((v) => v.id === item.id);
    pickVariant(variants[(i + 1) % variants.length]);
  };
  // chamado quando o canal trava: desce uma qualidade (se a opção automática estiver ligada)
  const lowerQuality = useRef<((auto: boolean) => void) | null>(null);
  lowerQuality.current = (auto: boolean) => {
    if (!getPrefs().autoQuality) return;
    const i = variants.findIndex((v) => v.id === item.id);
    const lower = i >= 0 ? variants[i + 1] : undefined;
    if (lower) pickVariant(lower, auto);
  };

  // Qualidade automática: mede a internet de tempos em tempos e escolhe FHD / HD / SD
  const autoRef = useRef<() => void>(() => {});
  autoRef.current = async () => {
    if (!getPrefs().autoQuality || variants.length < 2) return;
    const cur = variants.findIndex((v) => v.id === item.id);
    if (cur < 0) return;
    const mbps = await measureSpeed({ bytes: 1_000_000, timeoutMs: 8000 });
    if (mbps == null) return;
    // o teste roda junto com o vídeo, então soma o que o canal atual já está usando
    const effective = mbps + (NEED_MBPS[variants[cur].rank] || 4) * 0.7;
    let target = variants.findIndex((v) => (NEED_MBPS[v.rank] || 4) <= effective); // lista vem da maior para a menor
    if (target < 0) target = variants.length - 1;
    if (target > cur) {
      upVotes.n = 0;
      pickVariant(variants[target], true); // internet piorou: desce na hora
    } else if (target < cur) {
      upVotes.n += 1; // para subir, precisa dar bom duas medições seguidas
      if (upVotes.n >= 2) {
        upVotes.n = 0;
        pickVariant(variants[cur - 1], true, true);
      }
    } else upVotes.n = 0;
  };
  useEffect(() => {
    if (item.kind !== 'live' || variants.length < 2) return;
    const first = setTimeout(() => autoRef.current(), 10000);
    const id = setInterval(() => autoRef.current(), 45000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [item.id, item.kind, variants.length]);

  const changeFit = () => {
    const n = FIT_NEXT[fit];
    setFit(n);
    savePrefs({ fit: n });
    setNotice(FIT_LABEL[n]);
    setTimeout(() => setNotice(''), 1500);
  };

  const zap = (dir: 1 | -1) => {
    const list = item.channels || [];
    const i = list.findIndex((c) => c.id === item.id);
    if (i < 0 || list.length < 2) return;
    const next = list[(i + dir + list.length) % list.length];
    saveLastChannel(next.id, next.name, item.noHistory);
    onReplace({ ...item, id: next.id, url: x.liveUrl(next.id), title: next.name, icon: next.icon });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onTouchStart={poke}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls={item.kind !== 'live'}
        contentFit={fit}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {status === 'loading' ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
          <ActivityIndicator size="large" color={t.primary} />
          <Text style={{ color: '#fff', marginTop: 12 }}>Carregando…</Text>
        </View>
      ) : null}

      {status === 'error' ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000c', padding: 24, gap: 14 }]}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>Não foi possível reproduzir</Text>
          <Text style={{ color: '#bbb', textAlign: 'center', maxWidth: 480 }}>
            {item.kind === 'live' ? 'O canal pode estar fora do ar agora.' : 'O arquivo pode estar indisponível.'} Tente de novo em alguns minutos.
            {errorMsg ? `\n(${errorMsg})` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Voltar" onPress={onBack} hasTVPreferredFocus />
            {item.kind === 'live' && (item.channels?.length || 0) > 1 ? <Button title="Próximo canal" variant="ghost" onPress={() => zap(1)} /> : null}
          </View>
        </View>
      ) : null}

      {overlay && status !== 'error' ? (
        <LinearGradient colors={['#000c', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Focusable onPress={onBack} onFocus={poke} hasTVPreferredFocus={item.kind === 'live'} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 20 }}>‹</Text>
          </Focusable>
          <Text numberOfLines={1} style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }}>
            {item.title}
          </Text>
          {item.kind === 'live' && variants.length > 1 ? (
            <Focusable onPress={nextVariant} onFocus={poke} style={st.zap}>
              <Text style={st.zapText}>Qualidade: {curVariant?.label || 'Padrão'}</Text>
            </Focusable>
          ) : null}
          {nextEp ? (
            <Focusable onPress={() => goNextEp.current()} onFocus={poke} style={[st.zap, { backgroundColor: t.primary }]}>
              <Text style={st.zapText}>Próximo episódio ▶</Text>
            </Focusable>
          ) : null}
          <Focusable onPress={changeFit} onFocus={poke} style={st.zap}>
            <Text style={st.zapText}>⤢ {FIT_LABEL[fit]}</Text>
          </Focusable>
          {item.kind === 'live' && (item.channels?.length || 0) > 1 ? (
            <>
              <Focusable onPress={() => zap(-1)} onFocus={poke} style={st.zap}>
                <Text style={st.zapText}>▲ Canal</Text>
              </Focusable>
              <Focusable onPress={() => zap(1)} onFocus={poke} style={st.zap}>
                <Text style={st.zapText}>Canal ▼</Text>
              </Focusable>
            </>
          ) : null}
        </LinearGradient>
      ) : null}
      {notice ? (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#000000cc', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{notice}</Text>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  zap: { paddingHorizontal: 14, height: 44, borderRadius: 12, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' },
  zapText: { color: '#fff', fontWeight: '700' },
});
