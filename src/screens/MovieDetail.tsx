import React, { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Focusable, Loading, Message, Muted, Screen, useLayout } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { useXtream } from '../session';
import { firstBackdrop, VodInfo } from '../api/xtream';
import { isAdultName } from '../parental';
import { getProgress, loadFavorites, Progress, saveTaste, toggleFavorite } from '../storage';
import { useTheme } from '../theme';

/** Qualidade do arquivo: pela altura do vídeo (se o servidor informar) ou pelo nome */
function qualityLabel(info: any, name: string): string {
  const h = Number(info?.video?.height || info?.video?.coded_height || 0);
  if (h >= 2000) return '4K';
  if (h >= 1000) return 'Full HD';
  if (h >= 700) return 'HD';
  if (h > 0) return 'SD';
  const n = name.toLowerCase();
  if (/\b(4k|uhd)\b/.test(n)) return '4K';
  if (/\b(fhd|full ?hd|1080)/.test(n)) return 'Full HD';
  if (/\b(hd|720)/.test(n)) return 'HD';
  if (/\bsd\b|480/.test(n)) return 'SD';
  return 'Full HD';
}

/** Áudio: [L] = legendado, "dublado"/"dual" = dublado */
function audioLabel(name: string): string {
  if (/\[\s*l\s*\]|\bleg(endado)?\b/i.test(name)) return 'Legendado';
  if (/dual/i.test(name)) return 'Dual áudio';
  if (/dublad|\bdub\b/i.test(name)) return 'Dublado';
  return 'Padrão';
}

function Stars({ value }: { value: number }) {
  const full = Math.round(Math.max(0, Math.min(5, value / 2)));
  return (
    <Text style={{ color: '#3B82F6', fontSize: 18, letterSpacing: 2 }}>
      {'★'.repeat(full)}
      <Text style={{ color: '#ffffff44' }}>{'★'.repeat(5 - full)}</Text>
    </Text>
  );
}

export default function MovieDetailScreen({ navigation, route }: ScreenProps<'MovieDetail'>) {
  const { id, name, icon } = route.params;
  const t = useTheme();
  const x = useXtream();
  const { wide } = useLayout();
  const [info, setInfo] = useState<VodInfo | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<Progress | undefined>();
  const [isFav, setFav] = useState(false);
  const [adult, setAdult] = useState(false);

  useEffect(() => {
    x.vodInfo(id).then(setInfo).catch((e) => setError(e.message));
    setAdult(isAdultName(name));
  }, [x, id]);

  useFocusEffect(
    useCallback(() => {
      getProgress('movie', id).then(setProgress);
      loadFavorites().then((f) => setFav(f.some((v) => v.kind === 'movie' && v.id === id)));
    }, [id]),
  );

  if (error) {
    return (
      <Screen>
        <Message title="Não foi possível abrir" text={error}>
          <Button title="Voltar" onPress={() => navigation.goBack()} hasTVPreferredFocus />
        </Message>
      </Screen>
    );
  }
  if (!info) return <Screen><Loading /></Screen>;

  const i = info.info || {};
  const ext = info.movie_data?.container_extension || 'mp4';
  const poster = i.movie_image || i.cover_big || icon;
  const backdrop = firstBackdrop(i.backdrop_path) || poster;
  const title = i.name || name;
  const year = i.releasedate?.slice(0, 4);
  const play = async (startAt = 0) => {
    const cat = (info.movie_data as any)?.category_id;
    let noHistory = adult || isAdultName(name) || isAdultName(title);
    if (!noHistory) noHistory = !!(await (x as any).isAdultCategory?.('movie', cat).catch(() => false));
    if (!noHistory) saveTaste(id, cat);
    navigation.navigate('Player', { kind: 'movie', id, title, icon: poster, ext, startAt, url: x.movieUrl(id, ext), noHistory });
  };

  const rating = Number(i.rating);
  const genre = (i.genre || '').replace(/\s*,\s*/g, ' / ');
  const trailer = i.youtube_trailer ? (/^https?:/i.test(i.youtube_trailer) ? i.youtube_trailer : `https://www.youtube.com/watch?v=${i.youtube_trailer}`) : null;
  const dur = i.duration || (i.duration_secs ? `${Math.floor(i.duration_secs / 3600)}h ${String(Math.floor((i.duration_secs % 3600) / 60)).padStart(2, '0')}min` : '');
  const tiles: { icon: string; value: string; label: string }[] = [
    { icon: '⏱', value: dur || '—', label: 'Duração' },
    { icon: '▣', value: qualityLabel(i, title), label: 'Qualidade' },
    { icon: '🔊', value: audioLabel(title), label: 'Áudio' },
  ];
  const glass = { backgroundColor: '#ffffff12', borderColor: '#ffffff30' };

  return (
    <Screen padded={false}>
      {backdrop ? <Image source={{ uri: backdrop }} style={[StyleSheet.absoluteFillObject, { opacity: 0.55 }]} contentFit="cover" /> : null}
      <LinearGradient colors={[t.bg, t.bg + 'DD', t.bg + '55']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFillObject} />
      <LinearGradient colors={['transparent', t.bg + 'CC']} style={StyleSheet.absoluteFillObject} />
      <ScrollView contentContainerStyle={{ padding: wide ? 32 : 16, gap: 18 }}>
        <Focusable onPress={() => navigation.goBack()} style={{ width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderColor: '#ffffff55', backgroundColor: '#00000055' }}>
          <Text style={{ color: '#fff', fontSize: 26 }}>‹</Text>
        </Focusable>

        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 34 : 18, alignItems: wide ? 'flex-start' : 'center' }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ width: wide ? 240 : 170, aspectRatio: 2 / 3, borderRadius: 14, overflow: 'hidden', backgroundColor: t.surface2, borderWidth: 1, borderColor: '#ffffff33' }}>
              {poster ? <Image source={{ uri: poster }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
            </View>
            {rating > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Stars value={rating} />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{(rating / 2).toFixed(1)}</Text>
                <View style={{ backgroundColor: '#2563EB', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>IMDb</Text>
                </View>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{rating.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>

          <View style={{ flex: wide ? 1 : undefined, gap: 14, width: wide ? undefined : '100%' }}>
            <Text style={{ color: '#fff', fontSize: wide ? 36 : 25, fontWeight: '900' }}>
              {title}
              {year && !title.includes(year) ? ` (${year})` : ''}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              {year ? (
                <View style={[st.chip, { borderColor: '#3B82F6' }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{year}</Text>
                </View>
              ) : null}
              <Text style={{ color: '#fff', fontWeight: '700' }}>Filmes{genre ? `  •  ${genre}` : ''}</Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {progress ? (
                <>
                  <Button title={`Continuar de ${fmt(progress.position)}`} icon="▶" onPress={() => play(progress.position)} hasTVPreferredFocus style={{ minWidth: 190 }} />
                  <Button title="Do começo" variant="ghost" onPress={() => play(0)} />
                </>
              ) : (
                <Button title="Assistir" icon="▶" onPress={() => play(0)} hasTVPreferredFocus style={{ minWidth: 190 }} />
              )}
              {trailer ? <Button title="Trailer" icon="▷" variant="ghost" onPress={() => Linking.openURL(trailer)} /> : null}
              <Focusable
                onPress={async () => {
                  const f = await toggleFavorite({ kind: 'movie', id, name: title, icon: poster });
                  setFav(f.some((v) => v.kind === 'movie' && v.id === id));
                }}
                style={{ width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2, borderColor: t.line }}
                accessibilityLabel={isFav ? 'Remover dos favoritos' : 'Favoritar'}
              >
                <Text style={{ color: isFav ? '#F43F5E' : '#fff', fontSize: 24 }}>{isFav ? '♥' : '♡'}</Text>
              </Focusable>
            </View>

            {i.plot || i.description ? (
              <Text style={{ color: '#fff', fontSize: wide ? 16 : 14, lineHeight: wide ? 24 : 21, maxWidth: 900 }}>{i.plot || i.description}</Text>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
              {tiles.map((k) => (
                <View key={k.label} style={[st.tile, glass]}>
                  <Text style={{ color: '#fff', fontSize: 24 }}>{k.icon}</Text>
                  <View>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{k.value}</Text>
                    <Text style={{ color: '#ffffffaa', fontSize: 12 }}>{k.label}</Text>
                  </View>
                </View>
              ))}
            </View>

            {i.director || i.cast ? (
              <View style={{ gap: 4 }}>
                {i.director ? <Muted numberOfLines={2}>Direção: {i.director}</Muted> : null}
                {i.cast ? <Muted numberOfLines={3}>Elenco: {i.cast}</Muted> : null}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const st = StyleSheet.create({
  chip: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#3B82F622' },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, minWidth: 150 },
});

export function fmt(sec: number) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(r).padStart(2, '0')}`;
}
