import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { DetailLayout } from '../components/Detail';
import { Button, Focusable, Loading, Message, Muted, Screen, useLayout } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { useXtream } from '../session';
import { Episode, firstBackdrop, groupEpisodes, SeriesInfo } from '../api/xtream';
import { isAdultName } from '../parental';
import { getSeriesLast, loadFavorites, loadProgress, Progress, SeriesLast, toggleFavorite } from '../storage';
import { useTheme } from '../theme';

const fmtTime = (sec: number) => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s % 60).padStart(2, '0')}`;
};

export default function SeriesDetailScreen({ navigation, route }: ScreenProps<'SeriesDetail'>) {
  const { id, name, cover } = route.params;
  const t = useTheme();
  const x = useXtream();
  const { wide } = useLayout();
  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [error, setError] = useState('');
  const [season, setSeason] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [isFav, setFav] = useState(false);
  const [lastEp, setLastEp] = useState<SeriesLast | undefined>();

  useEffect(() => {
    x.seriesInfo(id).then(setInfo).catch((e) => setError(e.message));
  }, [x, id]);

  useFocusEffect(
    useCallback(() => {
      loadProgress().then((p) => setProgress(p.filter((v) => v.kind === 'episode' && v.seriesId === id)));
      getSeriesLast(id).then(setLastEp);
      loadFavorites().then((f) => setFav(f.some((v) => v.kind === 'series' && v.id === id)));
    }, [id]),
  );

  const seasons = useMemo(() => (info ? groupEpisodes(info) : []), [info]);
  useEffect(() => {
    if (season == null && seasons.length) setSeason(seasons[0].season);
  }, [seasons, season]);

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

  const i = info.info || ({} as SeriesInfo['info']);
  const poster = i.cover || cover;
  const episodes = seasons.find((s) => s.season === season)?.episodes || [];
  // onde parou: o último episódio visto (ou o próximo, se ele terminou)
  const flat = seasons.flatMap((v) => v.episodes);
  const resume = (() => {
    if (!flat.length) return null;
    const short = (e: Episode) => `T${e.season} E${e.episode_num}`;
    if (lastEp) {
      const idx = flat.findIndex((e) => Number(e.id) === lastEp.epId);
      if (idx >= 0) {
        if (!lastEp.finished) return { ep: flat[idx], startAt: lastEp.position, label: `Continuar ${short(flat[idx])} (${fmtTime(lastEp.position)})` };
        const next = flat[idx + 1];
        if (next) return { ep: next, startAt: 0, label: `Próximo: ${short(next)}` };
        return { ep: flat[idx], startAt: 0, label: `Rever ${short(flat[idx])}` };
      }
    }
    const p = progress[0];
    const pe = p ? flat.find((e) => Number(e.id) === p.id) : undefined;
    if (p && pe) return { ep: pe, startAt: p.position, label: `Continuar ${short(pe)} (${fmtTime(p.position)})` };
    return { ep: flat[0], startAt: 0, label: `Assistir ${short(flat[0])}` };
  })();

  const play = async (e: Episode, startAt = 0) => {
    let noHistory = isAdultName(name) || isAdultName(i.name);
    if (!noHistory) noHistory = !!(await (x as any).isAdultCategory?.('series', (i as any).category_id).catch(() => false));
    navigation.navigate('Player', {
      noHistory,
      episodes: flat.map((v) => ({ id: Number(v.id), title: `${i.name || name} · T${v.season} E${v.episode_num}`, ext: v.container_extension })),
      kind: 'episode',
      id: Number(e.id),
      seriesId: id,
      title: `${i.name || name} · T${e.season} E${e.episode_num}`,
      icon: poster,
      ext: e.container_extension,
      startAt,
      url: x.episodeUrl(e.id, e.container_extension),
    });
  };

  const rating = Number(i.rating);
  return (
    <DetailLayout
      onBack={() => navigation.goBack()}
      title={i.name || name}
      poster={poster}
      backdrop={firstBackdrop(i.backdrop_path)}
      meta={[i.releaseDate?.slice(0, 4), i.genre, rating > 0 ? `★ ${rating.toFixed(1)}` : null, `${seasons.length} temporada(s)`]}
      plot={i.plot}
      extra={[i.cast ? `Elenco: ${i.cast}` : null]}
      actions={
        <>
          {resume ? (
            <>
              <Button title={resume.label} icon="▶" hasTVPreferredFocus onPress={() => play(resume.ep, resume.startAt)} />
              {resume.startAt > 0 ? <Button title="Recomeçar episódio" icon="↺" variant="ghost" onPress={() => play(resume.ep, 0)} /> : null}
            </>
          ) : null}
          <Button
            title={isFav ? 'Favorito' : 'Favoritar'}
            icon={isFav ? '♥' : '♡'}
            variant="ghost"
            onPress={async () => {
              const f = await toggleFavorite({ kind: 'series', id, name: i.name || name, icon: poster });
              setFav(f.some((v) => v.kind === 'series' && v.id === id));
            }}
          />
        </>
      }
    >
      {seasons.length ? (
        <View style={{ gap: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {seasons.map((s) => (
              <Focusable
                key={s.season}
                onPress={() => setSeason(s.season)}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 99, backgroundColor: s.season === season ? t.primary : t.surface }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Temporada {s.season}</Text>
              </Focusable>
            ))}
          </ScrollView>
          <View style={{ gap: 8 }}>
            {episodes.map((e) => {
              const p = progress.find((v) => v.id === Number(e.id));
              return (
                <Focusable
                  key={e.id}
                  onPress={() => play(e, p?.position || 0)}
                  style={{ flexDirection: 'row', gap: 12, padding: 10, backgroundColor: t.surface, borderRadius: 12, alignItems: 'center' }}
                  focusStyle={{ transform: [{ scale: 1 }], backgroundColor: t.surface2 }}
                >
                  <View style={{ width: wide ? 160 : 110, aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden', backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    {e.info?.movie_image ? <Image source={{ uri: e.info.movie_image }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Text style={{ color: t.muted }}>▶</Text>}
                    {p?.duration ? (
                      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: '#0008' }}>
                        <View style={{ width: `${Math.min(100, (p.position / p.duration) * 100)}%`, height: 3, backgroundColor: t.primary }} />
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: '700' }} numberOfLines={1}>
                      {e.episode_num}. {e.title}
                    </Text>
                    {e.info?.plot ? <Muted numberOfLines={2} style={{ fontSize: 13 }}>{e.info.plot}</Muted> : null}
                    {e.info?.duration ? <Muted style={{ fontSize: 12 }}>{e.info.duration}</Muted> : null}
                  </View>
                </Focusable>
              );
            })}
          </View>
        </View>
      ) : (
        <Muted>Nenhum episódio disponível.</Muted>
      )}
    </DetailLayout>
  );
}
