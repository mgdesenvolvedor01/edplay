import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Cat, CategoryList } from '../components/CategoryList';
import { Poster } from '../components/Poster';
import { Button, Input, Loading, Message, Muted, Screen, TopBar, useLayout } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { PinModal } from '../components/PinModal';
import { isAdultName, isLocked, useParentalVersion } from '../parental';
import { useXtream } from '../session';
import { Favorite, loadFavorites, toggleFavorite } from '../storage';

const ALL = '__all';
const FAV = '__fav';

type Item = { id: number; name: string; image?: string; rating?: string | number; added?: string; kind: 'movie' | 'series' };

/** Navegador de Filmes ou Séries (mesma tela, muda só a fonte dos dados) */
export default function VodScreen({ navigation, route }: ScreenProps<'Vod'>) {
  const { kind, categoryId, match, title, both } = route.params;
  const re = useMemo(() => (match ? new RegExp(match, 'i') : null), [match]);
  const x = useXtream();
  const { wide, width, cols: baseCols } = useLayout();
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [cat, setCat] = useState(categoryId || ALL);
  const [items, setItems] = useState<Item[] | null>(null);
  const [favs, setFavs] = useState<Favorite[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => void loadFavorites().then(setFavs), []));

  const parentalV = useParentalVersion();
  const [pending, setPending] = useState<string | null>(null);

  // Categorias. As adultas aparecem com cadeado e pedem a senha (PIN) ao abrir.
  useEffect(() => {
    const mk = (k: 'movie' | 'series', prefix: string): Promise<Cat[]> =>
      (k === 'movie' ? x.vodCategoriesAll() : x.seriesCategoriesAll()).then((c) =>
        c.map((i) => ({ id: prefix + String(i.category_id), name: (both ? (k === 'movie' ? '🎬 ' : '📺 ') : '') + i.category_name, adult: isAdultName(i.category_name) })),
      );
    const run = async () => {
      let list: Cat[];
      if (both) {
        const [m, sr] = await Promise.all([mk('movie', 'm:'), mk('series', 's:').catch(() => [] as Cat[])]);
        list = [...m, ...sr];
      } else {
        list = await mk(kind, '');
      }
      if (re) {
        // atalho do menu (Kids, Animes, Novelas…): só as categorias com esse nome
        const only = list.filter((k) => re.test(k.name));
        if (both) {
          setCats(only.length > 1 ? [{ id: ALL, name: 'Todos' }, ...only] : only);
          if (only.length && !categoryId) setCat(only.length > 1 ? ALL : only[0].id);
          return;
        }
        setCats(only.length ? only : list);
        if (only.length && !categoryId) setCat(only[0].id);
        return;
      }
      setCats([{ id: FAV, name: '★ Favoritos' }, { id: ALL, name: kind === 'movie' ? 'Todos os filmes' : 'Todas as séries' }, ...list]);
      // abre numa categoria (Lançamentos) em vez de carregar o catálogo inteiro, que é pesado na TV
      if (!categoryId) {
        const first = list.find((k) => !k.adult && /lan[cç]amento|novidade|recente/i.test(k.name)) || list.find((k) => !k.adult);
        if (first) setCat(first.id);
      }
    };
    run().catch((e) => setError(e.message));
  }, [x, kind, re, categoryId, both]);

  useEffect(() => {
    if (!cats) return;
    let alive = true;
    setItems(null);
    const movies = (id?: string): Promise<Item[]> =>
      x.vodStreams(id).then((r) => r.map((m) => ({ id: m.stream_id, name: m.name, image: m.stream_icon, rating: m.rating, added: m.added, kind: 'movie' as const })));
    const shows = (id?: string): Promise<Item[]> =>
      x.series(id).then((r) => r.map((s) => ({ id: s.series_id, name: s.name, image: s.cover, rating: s.rating, added: s.last_modified, kind: 'series' as const })));
    const byId = (c: string): Promise<Item[]> => (c.startsWith('m:') ? movies(c.slice(2)) : c.startsWith('s:') ? shows(c.slice(2)) : kind === 'movie' ? movies(c) : shows(c));

    let load: Promise<Item[]>;
    if (both && cat === ALL) {
      const ids = cats.filter((c) => c.id !== ALL && !(c.adult && isLocked())).map((c) => c.id);
      load = Promise.all(ids.map((i) => byId(i).catch(() => [] as Item[]))).then((all) => {
        const seen = new Set<string>();
        return all.flat().filter((i) => !seen.has(i.kind + i.id) && !!seen.add(i.kind + i.id));
      });
    } else if (cat === ALL || cat === FAV) {
      load = kind === 'movie' ? movies() : shows();
    } else {
      load = byId(cat);
    }
    load
      .then((r) => {
        if (!alive) return;
        if (cat === FAV) r = r.filter((i) => favs.some((f) => f.kind === kind && f.id === i.id));
        // sempre os adicionados mais recentemente primeiro
        r = [...r].sort((a, b) => Number(b.added || 0) - Number(a.added || 0));
        setItems(r);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [x, kind, cat, both, cats, parentalV, cat === FAV ? favs : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickCat = (id: string) => {
    const c = cats?.find((k) => k.id === id);
    if (c?.adult && isLocked()) return setPending(id);
    setCat(id);
  };

  const list = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.name?.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const gridW = wide ? width - 250 - 18 - 48 : width - 24;
  const cols = wide ? Math.max(4, Math.floor(gridW / 165)) : baseCols;
  const gap = 12;
  const posterW = Math.floor((gridW - gap * (cols - 1)) / cols);

  const open = (i: Item) =>
    i.kind === 'movie'
      ? navigation.navigate('MovieDetail', { id: i.id, name: i.name, icon: i.image })
      : navigation.navigate('SeriesDetail', { id: i.id, name: i.name, cover: i.image });

  const fav = async (i: Item) => setFavs(await toggleFavorite({ kind: i.kind, id: i.id, name: i.name, icon: i.image }));

  if (error) {
    return (
      <Screen>
        <Message title="Não foi possível carregar" text={error}>
          <Button title="Voltar" onPress={() => navigation.goBack()} hasTVPreferredFocus />
        </Message>
      </Screen>
    );
  }

  return (
    <Screen padded={false} style={{ padding: wide ? 24 : 12 }}>
      <TopBar title={title || (kind === 'movie' ? 'Filmes' : 'Séries')} onBack={() => navigation.goBack()} right={<Muted>{list ? `${list.length} títulos` : ''}</Muted>} />
      {!cats ? (
        <Loading text="Carregando categorias…" />
      ) : (
        <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', gap: wide ? 18 : 6 }}>
          <CategoryList cats={cats} selected={cat} onSelect={pickCat} vertical={wide} lock={isLocked()} />
          <View style={{ flex: 1, gap: 10 }}>
            <Input value={query} onChangeText={setQuery} placeholder={kind === 'movie' ? 'Buscar filme…' : 'Buscar série…'} style={{ height: 44 }} />
            {!list ? (
              <Loading />
            ) : !list.length ? (
              <Muted style={{ textAlign: 'center', marginTop: 30 }}>{cat === FAV ? 'Segure OK sobre um título para favoritar.' : 'Nada por aqui.'}</Muted>
            ) : (
              <FlatList
                key={cols}
                data={list}
                numColumns={cols}
                keyExtractor={(i) => String(i.id)}
                columnWrapperStyle={{ gap }}
                contentContainerStyle={{ gap, paddingBottom: 30 }}
                initialNumToRender={cols * 3}
                windowSize={7}
                maxToRenderPerBatch={cols * 2}
                removeClippedSubviews
                renderItem={({ item }) => (
                  <Poster
                    width={posterW}
                    title={item.name}
                    image={item.image}
                    subtitle={item.rating && Number(item.rating) > 0 ? `★ ${Number(item.rating).toFixed(1)}${favs.some((f) => f.kind === item.kind && f.id === item.id) ? '  ♥' : ''}` : favs.some((f) => f.kind === item.kind && f.id === item.id) ? '♥ Favorito' : undefined}
                    onPress={() => open(item)}
                    onLongPress={() => fav(item)}
                  />
                )}
              />
            )}
          </View>
        </View>
      )}
      <PinModal
        visible={pending !== null}
        onClose={() => setPending(null)}
        onOk={() => {
          if (pending) setCat(pending);
          setPending(null);
        }}
      />
    </Screen>
  );
}
