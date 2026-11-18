import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, Text, View, DeviceEventEmitter } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Brand } from '../components/Brand';
import { Cat } from '../components/CategoryList';
import { PinModal } from '../components/PinModal';
import { isAdultName, isLocked, useParentalVersion } from '../parental';
import { LivePreview } from '../components/LivePreview';
import { Button, Focusable, Input, Loading, Message, Muted, Screen } from '../components/ui';
import { useLayout } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { useXtream } from '../session';
import { EpgItem, LiveStream, Xtream } from '../api/xtream';
import { Favorite, loadFavorites, loadLastChannel, saveLastChannel, toggleFavorite } from '../storage';
import { useTheme } from '../theme';

const ALL = '__all';
const FAV = '__fav';
const ROW_H = 36;

// ---------- Guia de programação (cache simples por canal) ----------
const epgCache = new Map<number, { at: number; p: Promise<EpgItem[]> }>();
function getEpg(x: Xtream, id: number, limit = 4): Promise<EpgItem[]> {
  const c = epgCache.get(id);
  if (c && Date.now() - c.at < 5 * 60000) return c.p;
  const entry = { at: Date.now(), p: x.shortEpg(id, limit) };
  // guia vazio: tenta de novo em cerca de 1 minuto (o servidor pode ainda não ter carregado)
  entry.p.then((r) => {
    if (!r.length) entry.at = Date.now() - 4 * 60000;
  });
  epgCache.set(id, entry);
  return entry.p;
}
const ts = (e: EpgItem, k: 'start' | 'end') => {
  const raw = k === 'start' ? e.start_timestamp : e.stop_timestamp;
  if (raw) return Number(raw) * 1000;
  const s = (k === 'start' ? e.start : e.end) || '';
  return new Date(s.replace(' ', 'T')).getTime();
};
const hhmm = (ms: number) => (isFinite(ms) ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const pct = (e?: EpgItem) => {
  if (!e) return 0;
  const a = ts(e, 'start');
  const b = ts(e, 'end');
  return b > a ? Math.max(0, Math.min(1, (Date.now() - a) / (b - a))) : 0;
};
/** Programa que está passando agora (ou o primeiro da lista) */
const nowOf = (list: EpgItem[]) => list.find((e) => ts(e, 'start') <= Date.now() && ts(e, 'end') > Date.now()) || list[0];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function LiveScreen({ navigation, route }: ScreenProps<'Live'>) {
  const t = useTheme();
  const x = useXtream();
  const { wide } = useLayout();
  const clock = useClock();
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [cat, setCat] = useState<string>(route.params?.categoryId || ALL);
  const [items, setItems] = useState<LiveStream[] | null>(null);
  const [favs, setFavs] = useState<Favorite[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selected, setSelected] = useState<LiveStream | null>(null);
  const [restoreId, setRestoreId] = useState<number | null>(null); // rola a lista até o último canal assistido
  const [epg, setEpg] = useState<EpgItem[]>([]);
  const [showGuide, setShowGuide] = useState(true);
  const lastTap = useRef<{ id: number; at: number }>({ id: -1, at: 0 });
  const focused = useIsFocused(); // a prévia para quando a tela cheia abre (evita som duplicado)
  const pickedCat = useRef(!!route.params?.categoryId);
  const parentalV = useParentalVersion();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const focusedCh = useRef<LiveStream | null>(null); // canal que está com o foco do controle
  const longFired = useRef(0); // quando o último "segurar OK" favoritou (para não abrir o canal em seguida)
  const lastFav = useRef(0);

  useFocusEffect(useCallback(() => void loadFavorites().then(setFavs), []));

  useEffect(() => {
    x.liveCategoriesAll()
      .then((c) => {
        const list = c.map((k) => ({ id: String(k.category_id), name: k.category_name, adult: isAdultName(k.category_name) }));
        const re = route.params?.match ? new RegExp(route.params.match, 'i') : null;
        const only = re ? list.filter((k) => re.test(k.name)) : [];
        if (only.length) {
          setCats(only);
          if (!route.params?.categoryId) setCat(only[0].id);
          return;
        }
        setCats([{ id: FAV, name: '★ Favoritos' }, { id: ALL, name: 'Todos os canais' }, ...list]);
        if (pickedCat.current) return;
        // volta no último canal assistido (categoria + canal selecionado); sem histórico, abre em Favoritos se houver
        const favFallback = () => loadFavorites().then((f) => !pickedCat.current && f.some((k) => k.kind === 'live') && setCat(FAV));
        loadLastChannel()
          .then(async (lastId) => {
            if (!lastId) return favFallback();
            const all = await x.liveStreams(); // já sem os adultos quando o bloqueio está ligado
            const ch = all.find((c) => c.stream_id === lastId);
            if (!ch || pickedCat.current) return favFallback();
            const catId = String(ch.category_id);
            setCat(list.some((k) => k.id === catId) ? catId : ALL);
            setSelected(ch);
            setRestoreId(ch.stream_id);
            setTimeout(() => setRestoreId(null), 2500);
          })
          .catch(() => favFallback());
      })
      .catch((e) => setError(e.message));
  }, [x]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    setItems(null);
    const done = (r: LiveStream[]) => alive && setItems(r);
    const fail = (e: any) => alive && setError(e.message);
    if (cat === FAV) x.liveStreams().then((all) => done(all.filter((s) => favs.some((f) => f.kind === 'live' && f.id === s.stream_id)))).catch(fail);
    else x.liveStreams(cat === ALL ? undefined : cat).then(done).catch(fail);
    return () => {
      alive = false;
    };
  }, [x, cat, parentalV, cat === FAV ? favs : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    return q ? items.filter((s) => s.name?.toLowerCase().includes(q)) : items;
  }, [items, query]);

  // guia do canal selecionado
  useEffect(() => {
    if (!selected) return setEpg([]);
    let alive = true;
    getEpg(x, selected.stream_id, 4).then((e) => alive && setEpg(e));
    return () => {
      alive = false;
    };
  }, [x, selected]);

  const fullscreen = async (s: LiveStream) => {
    const noHistory = isAdultName(s.name) || !!(await (x as any).isAdultCategory?.('live', s.category_id).catch(() => false));
    saveLastChannel(s.stream_id, s.name, noHistory);
    navigation.navigate('Player', {
      noHistory,
      kind: 'live',
      id: s.stream_id,
      title: s.name,
      icon: s.stream_icon,
      url: x.liveUrl(s.stream_id),
      channels: (list || []).map((c) => ({ id: c.stream_id, name: c.name, icon: c.stream_icon })),
    });
  };

  /** 1 clique: toca na prévia · 2 cliques (ou clique no que já está tocando): tela cheia */
  const onChannel = (s: LiveStream) => {
    const now = Date.now();
    if (now - longFired.current < 900) return; // soltou o OK depois de segurar para favoritar
    const again = lastTap.current.id === s.stream_id && (now - lastTap.current.at < 1500 || selected?.stream_id === s.stream_id);
    lastTap.current = { id: s.stream_id, at: now };
    if (again) return fullscreen(s);
    setSelected(s);
    if (!isAdultName(s.name)) {
      (x as any).isAdultCategory?.('live', s.category_id).catch(() => false).then((a: boolean) => !a && saveLastChannel(s.stream_id, s.name));
    }
  };

  const isFav = (id: number) => favs.some((f) => f.kind === 'live' && f.id === id);
  const fav = async (s: LiveStream) => {
    if (Date.now() - lastFav.current < 900) return; // segurar pode chegar por dois caminhos: conta uma vez só
    lastFav.current = Date.now();
    const f = await toggleFavorite({ kind: 'live', id: s.stream_id, name: s.name, icon: s.stream_icon });
    setFavs(f);
    setNotice(f.some((k) => k.kind === 'live' && k.id === s.stream_id) ? '★ Canal adicionado aos favoritos' : 'Canal removido dos favoritos');
  };
  const favRef = useRef(fav);
  favRef.current = fav;

  // Segurar o OK do controle remoto favorita o canal em foco (o Android TV não manda "toque longo" para o app)
  useEffect(() => {
    if (!focused) return;
    let down = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = DeviceEventEmitter.addListener('onHWKeyEvent', (e: any) => {
      if (e?.eventType !== 'select') return;
      if (e.eventKeyAction === 0) {
        if (down) return;
        down = true;
        timer = setTimeout(() => {
          const c = focusedCh.current;
          if (down && c) {
            longFired.current = Date.now();
            favRef.current(c);
          }
        }, 650);
      } else if (e.eventKeyAction === 1) {
        down = false;
        if (timer) clearTimeout(timer);
      }
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [focused]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 1800);
    return () => clearTimeout(id);
  }, [notice]);

  if (error) {
    return (
      <Screen>
        <Message title="Não foi possível carregar" text={error}>
          <Button title="Voltar" onPress={() => navigation.goBack()} hasTVPreferredFocus />
        </Message>
      </Screen>
    );
  }

  const panel = { backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 16, padding: 8 };
  const roundBtn = { width: 38, height: 38, borderRadius: 19, backgroundColor: t.surface2, alignItems: 'center' as const, justifyContent: 'center' as const };

  // ---------- Cabeçalho ----------
  const Header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
      <Focusable onPress={() => navigation.goBack()} style={[roundBtn, { width: 44 }]}>
        <Text style={{ color: t.text, fontSize: 18 }}>‹</Text>
      </Focusable>
      {wide ? <Brand /> : null}
      <Text numberOfLines={1} style={{ color: t.text, fontSize: wide ? 17 : 16, fontWeight: '800', flex: 1 }}>
        {route.params?.title || 'Canais ao vivo'}
      </Text>
      <Focusable onPress={() => setShowSearch((v) => !v)} style={roundBtn}>
        <Text style={{ color: t.text, fontSize: 17 }}>🔍</Text>
      </Focusable>
      <Focusable onPress={() => navigation.navigate('Settings')} style={roundBtn}>
        <Text style={{ color: t.text, fontSize: 17 }}>⚙</Text>
      </Focusable>
      {wide ? (
        <View style={[roundBtn, { width: 70, borderRadius: 19 }]}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 13 }}>{clock}</Text>
        </View>
      ) : null}
    </View>
  );

  // ---------- Colunas ----------
  const Categories = (
    <View style={[panel, wide ? { width: 190 } : { paddingVertical: 6 }]}>
      {wide ? <Text style={{ color: t.text, fontSize: 14, fontWeight: '800', margin: 4, marginBottom: 6 }}>Categorias</Text> : null}
      {!cats ? (
        <Loading />
      ) : (
        <FlatList
          data={cats}
          horizontal={!wide}
          keyExtractor={(c) => c.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: wide ? 2 : 6 }}
          extraData={parentalV}
          renderItem={({ item }) => {
            const on = item.id === cat;
            const lockIt = !!item.adult && isLocked();
            return (
              <Focusable
                onPress={() => {
                  pickedCat.current = true;
                  if (lockIt) return setPending(item.id);
                  setCat(item.id);
                }}
                hasTVPreferredFocus={wide && on && !selected}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: wide ? 7 : 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: on ? t.primary + '40' : 'transparent', borderColor: on ? t.primary : 'transparent' }}
              >
                <Text style={{ fontSize: 12 }}>{item.id === FAV ? '❤️' : lockIt ? '🔒' : '📺'}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: t.text, fontWeight: on ? '800' : '600', fontSize: 10.5, flexShrink: 1 }}>
                  {item.name.replace(/^\s*canais?\s*[|:\-–]\s*/i, '')}
                </Text>
              </Focusable>
            );
          }}
        />
      )}
    </View>
  );

  const Channels = (
    <View style={[panel, { flex: wide ? undefined : 1, width: wide ? 205 : undefined, padding: wide ? 6 : 8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 4, marginBottom: 6 }}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '800' }}>Canais</Text>
        <Muted>{list ? `${list.length}` : ''}</Muted>
      </View>
      {showSearch ? <Input value={query} onChangeText={setQuery} placeholder="Buscar canal…" autoFocus style={{ height: 44, marginBottom: 8 }} /> : null}
      {!list ? (
        <Loading />
      ) : !list.length ? (
        <Muted style={{ textAlign: 'center', marginTop: 30 }}>{cat === FAV ? 'Use o botão "Favorito" para guardar canais aqui.' : 'Nenhum canal aqui.'}</Muted>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(s) => String(s.stream_id)}
          getItemLayout={(_, i) => ({ length: ROW_H + 4, offset: (ROW_H + 4) * i, index: i })}
          initialScrollIndex={(() => {
            const i = restoreId ? list.findIndex((c) => c.stream_id === restoreId) : -1;
            return i > 0 ? i : undefined;
          })()}
          initialNumToRender={10}
          windowSize={7}
          maxToRenderPerBatch={12}
          removeClippedSubviews
          renderItem={({ item }) => (
            <ChannelCard x={x} item={item} active={selected?.stream_id === item.stream_id} fav={isFav(item.stream_id)} onPress={() => onChannel(item)} onLongPress={() => fav(item)} onFocusItem={() => (focusedCh.current = item)} />
          )}
        />
      )}
    </View>
  );

  const now = nowOf(epg);
  const upcoming = epg.filter((e) => e !== now && ts(e, 'start') >= (now ? ts(now, 'start') : 0)).slice(0, 3);
  const previewUrl = selected ? x.liveUrl(selected.stream_id) : null;
  const fallback = selected ? x.liveUrl(selected.stream_id, 'ts') : null;

  const Preview = (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12 }}>
      <LivePreview url={previewUrl} fallbackUrl={fallback} paused={!focused} headers={(x as any).headers} />
      <View style={{ height: 4, borderRadius: 2, backgroundColor: t.line }}>
        <View style={{ width: `${pct(now) * 100}%`, height: 4, borderRadius: 2, backgroundColor: t.primary }} />
      </View>
      {selected ? (
        <>
          <View style={[panel, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {selected.stream_icon ? <Image source={{ uri: selected.stream_icon }} style={{ width: 48, height: 48 }} contentFit="contain" /> : <Text style={{ fontSize: 24 }}>📺</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: 17 }}>
                {selected.name}
              </Text>
              {now ? (
                <>
                  <Text numberOfLines={1} style={{ color: t.text, fontSize: 14 }}>
                    {now.title}
                  </Text>
                  <Muted style={{ fontSize: 12 }}>
                    {hhmm(ts(now, 'start'))} - {hhmm(ts(now, 'end'))}
                  </Muted>
                </>
              ) : (
                <Muted style={{ fontSize: 13 }}>Sem guia de programação</Muted>
              )}
            </View>
            <SmallBtn label={isFav(selected.stream_id) ? '♥ Favorito' : '♡ Favorito'} onPress={() => fav(selected)} />
            <SmallBtn label="☰ Guia" onPress={() => setShowGuide((v) => !v)} />
            <SmallBtn label="⛶ Tela cheia" onPress={() => fullscreen(selected)} />
          </View>
          <View style={{ backgroundColor: t.primary + '22', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 }}>
            <Text style={{ color: t.text, fontSize: 13 }}>Dica: aperte 2x no canal para abrir em tela cheia · segure para favoritar</Text>
          </View>
          {showGuide && upcoming.length ? (
            <View style={[panel, { gap: 4 }]}>
              {upcoming.map((e, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < upcoming.length - 1 ? 1 : 0, borderColor: t.line }}>
                  <Text style={{ color: i === 0 ? t.accent : t.muted, fontWeight: '800', fontSize: 12, width: 90 }}>{i === 0 ? 'A SEGUIR' : 'DEPOIS'}</Text>
                  <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', flex: 1 }}>
                    {e.title}
                  </Text>
                  <Muted style={{ fontSize: 12 }}>{hhmm(ts(e, 'start'))}</Muted>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );

  return (
    <Screen padded={false} style={{ padding: wide ? 14 : 8 }}>
      {Header}
      {wide ? (
        <View style={{ flex: 1, flexDirection: 'row', gap: 14 }}>
          {Categories}
          {Channels}
          <View style={{ flex: 1 }}>{Preview}</View>
        </View>
      ) : (
        <View style={{ flex: 1, gap: 10 }}>
          {selected ? <View style={{ maxHeight: '45%' }}>{Preview}</View> : null}
          {Categories}
          {Channels}
        </View>
      )}
      {notice ? (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: '#000000cc', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{notice}</Text>
        </View>
      ) : null}
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

  function SmallBtn({ label, onPress }: { label: string; onPress: () => void }) {
    return (
      <Focusable onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderColor: t.primary + '88', backgroundColor: t.surface2, minWidth: 70, alignItems: 'center' }}>
        <Text style={{ color: t.text, fontSize: 11, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
      </Focusable>
    );
  }
}

/** Card do canal: logo redondo, nome, programa atual e barra de progresso */
const ChannelCard = memo(function ChannelCard({
  x,
  item,
  active,
  fav,
  onPress,
  onLongPress,
  onFocusItem,
}: {
  x: Xtream;
  item: LiveStream;
  active: boolean;
  fav: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onFocusItem: () => void;
}) {
  const t = useTheme();
  const [now, setNow] = useState<EpgItem | undefined>();
  useEffect(() => {
    let alive = true;
    // pequeno atraso para não buscar o guia enquanto a lista rola rápido
    const id = setTimeout(() => getEpg(x, item.stream_id, 4).then((e) => alive && setNow(nowOf(e))), 350);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [x, item.stream_id]);

  return (
    <Focusable
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocusItem}
      style={{ height: ROW_H, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, borderRadius: 10, backgroundColor: active ? t.primary + '33' : t.surface2, borderColor: active ? t.primary : t.line }}
      focusStyle={{ transform: [{ scale: 1.02 }], borderColor: t.primary }}
    >
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {item.stream_icon ? <Image source={{ uri: item.stream_icon }} style={{ width: 21, height: 21 }} contentFit="contain" recyclingKey={item.stream_icon} /> : <Text>📺</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: 11 }}>
          {item.name} {fav ? <Text style={{ color: t.warn }}>★</Text> : null}
        </Text>
        {now ? (
          <>
            <Text numberOfLines={1} style={{ color: t.muted, fontSize: 9, marginTop: 0 }}>
              {now.title} · {hhmm(ts(now, 'start'))} - {hhmm(ts(now, 'end'))}
            </Text>
            <View style={{ height: 2, borderRadius: 1, backgroundColor: t.line, marginTop: 3 }}>
              <View style={{ width: `${pct(now) * 100}%`, height: 2, borderRadius: 2, backgroundColor: t.primary }} />
            </View>
          </>
        ) : null}
      </View>
    </Focusable>
  );
});
