import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Poster } from '../components/Poster';
import { Focusable, Input, Loading, Muted, Screen, TopBar, useLayout } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { isAdultName } from '../parental';
import { useXtream } from '../session';
import { LiveStream, Series, VodStream } from '../api/xtream';
import { useTheme } from '../theme';

/** Remove acentos para a busca achar "acao" em "Ação" */
const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function SearchScreen({ navigation }: ScreenProps<'Search'>) {
  const t = useTheme();
  const x = useXtream();
  const { wide } = useLayout();
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ live: LiveStream[]; vod: VodStream[]; series: Series[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2 || data || loading) return;
    setLoading(true);
    Promise.all([x.liveStreams().catch(() => []), x.vodStreams().catch(() => []), x.series().catch(() => [])])
      .then(([live, vod, series]) => setData({ live, vod, series }))
      .finally(() => setLoading(false));
  }, [q, data, loading, x]);

  const res = useMemo(() => {
    const n = norm(q.trim());
    if (!data || n.length < 2) return null;
    const f = <T extends { name: string }>(arr: T[]) => arr.filter((i) => norm(i.name).includes(n)).slice(0, 40);
    return { live: f(data.live), vod: f(data.vod), series: f(data.series) };
  }, [q, data]);

  const posterW = wide ? 140 : 112;

  return (
    <Screen padded={false} style={{ padding: wide ? 24 : 12 }}>
      <TopBar title="Buscar" onBack={() => navigation.goBack()} />
      <Input value={q} onChangeText={setQ} placeholder="Nome do canal, filme ou série…" autoFocus returnKeyType="search" />
      {loading ? <Loading text="Carregando o catálogo…" /> : null}
      {!res && !loading ? <Muted style={{ textAlign: 'center', marginTop: 30 }}>Digite pelo menos 2 letras.</Muted> : null}
      {res ? (
        <ScrollView contentContainerStyle={{ gap: 20, paddingVertical: 16 }}>
          {!res.live.length && !res.vod.length && !res.series.length ? <Muted style={{ textAlign: 'center' }}>Nada encontrado.</Muted> : null}
          {res.live.length ? (
            <Section title={`Canais (${res.live.length})`}>
              <FlatList
                horizontal
                data={res.live}
                keyExtractor={(s) => 'l' + s.stream_id}
                contentContainerStyle={{ gap: 10 }}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Focusable
                    onPress={() =>
                      navigation.navigate('Player', {
                        noHistory: isAdultName(item.name),
                        kind: 'live',
                        id: item.stream_id,
                        title: item.name,
                        icon: item.stream_icon,
                        url: x.liveUrl(item.stream_id),
                        channels: res.live.map((c) => ({ id: c.stream_id, name: c.name, icon: c.stream_icon })),
                      })
                    }
                    style={{ width: 160, height: 110, borderRadius: 12, backgroundColor: t.surface, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {item.stream_icon ? <Image source={{ uri: item.stream_icon }} style={{ width: 90, height: 50 }} contentFit="contain" /> : <Text style={{ fontSize: 26 }}>📺</Text>}
                    <Text numberOfLines={2} style={{ color: t.text, fontSize: 12, textAlign: 'center' }}>
                      {item.name}
                    </Text>
                  </Focusable>
                )}
              />
            </Section>
          ) : null}
          {res.vod.length ? (
            <Section title={`Filmes (${res.vod.length})`}>
              <FlatList
                horizontal
                data={res.vod}
                keyExtractor={(s) => 'v' + s.stream_id}
                contentContainerStyle={{ gap: 10 }}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Poster width={posterW} title={item.name} image={item.stream_icon} onPress={() => navigation.navigate('MovieDetail', { id: item.stream_id, name: item.name, icon: item.stream_icon })} />
                )}
              />
            </Section>
          ) : null}
          {res.series.length ? (
            <Section title={`Séries (${res.series.length})`}>
              <FlatList
                horizontal
                data={res.series}
                keyExtractor={(s) => 's' + s.series_id}
                contentContainerStyle={{ gap: 10 }}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Poster width={posterW} title={item.name} image={item.cover} onPress={() => navigation.navigate('SeriesDetail', { id: item.series_id, name: item.name, cover: item.cover })} />
                )}
              />
            </Section>
          ) : null}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
      {children}
    </View>
  );
}
