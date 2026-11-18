import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Brand } from '../components/Brand';
import { WideCard } from '../components/WideCard';
import { PinModal } from '../components/PinModal';
import { Button, Focusable, Muted, Screen, useLayout } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { loadProgress, loadTaste, Progress } from '../storage';
import { isAdultName, useParentalVersion } from '../parental';
import { useTheme } from '../theme';
import { Category, firstBackdrop, formatExp, groupEpisodes, Series, VodInfo, VodStream, Xtream } from '../api/xtream';

type Nav = ScreenProps<'Home'>['navigation'];

/** Itens do menu lateral. "match" filtra as categorias do servidor pelo nome. */
const MENU: { key: string; label: string; icon: string; go: (n: Nav) => void }[] = [
  { key: 'search', label: 'Buscar', icon: '🔍', go: (n) => n.navigate('Search') },
  { key: 'home', label: 'Início', icon: '⌂', go: () => {} },
  { key: 'live', label: 'Canais', icon: '📺', go: (n) => n.navigate('Live') },
  { key: 'movies', label: 'Filmes', icon: '🎬', go: (n) => n.navigate('Vod', { kind: 'movie' }) },
  { key: 'series', label: 'Séries', icon: '🎞', go: (n) => n.navigate('Vod', { kind: 'series' }) },
  { key: 'kids', label: 'Kids', icon: '⭐', go: (n) => n.navigate('Vod', { kind: 'movie', match: 'kid|infant|crian|desenho|anima[cç]|famil|disney', title: 'Kids' }) },
  { key: 'animes', label: 'Animes', icon: '🐉', go: (n) => n.navigate('Vod', { kind: 'series', match: 'anime', title: 'Animes', both: true }) },
  { key: 'novelas', label: 'Novelas', icon: '❤', go: (n) => n.navigate('Vod', { kind: 'series', match: 'novela|dorama|turca', title: 'Novelas' }) },
  { key: 'favs', label: 'Favoritos', icon: '♥', go: (n) => n.navigate('Favorites') },
  { key: 'settings', label: 'Configurações', icon: '⚙', go: (n) => n.navigate('Settings') },
  { key: 'adult', label: 'Adultos', icon: '🔒', go: () => {} },
  { key: 'refresh', label: 'Atualizar', icon: '⟳', go: () => {} },
];

/** Categorias adultas (abre só depois do PIN) */
const ADULT_MATCH = 'xxx|adult|\\+ ?18|18 ?\\+|porn|er[oó]tic';

/** Atalhos de streaming (aparecem os que existem nas categorias do servidor) */
const PROVIDERS: { key: string; label: string; img: number; re: string }[] = [
  { key: 'netflix', label: 'Netflix', img: require('../../assets/providers/netflix.png'), re: 'netflix' },
  { key: 'hbo', label: 'HBO Max', img: require('../../assets/providers/hbo.png'), re: 'hbo|\\bmax\\b' },
  { key: 'globoplay', label: 'Globoplay', img: require('../../assets/providers/globoplay.png'), re: 'globo' },
  { key: 'prime', label: 'Prime Video', img: require('../../assets/providers/prime.png'), re: 'prime|amazon' },
  { key: 'disney', label: 'Disney+', img: require('../../assets/providers/disney.png'), re: 'disney' },
  { key: 'paramount', label: 'Paramount+', img: require('../../assets/providers/paramount.png'), re: 'paramount' },
  { key: 'apple', label: 'Apple TV+', img: require('../../assets/providers/apple.png'), re: 'apple' },
  { key: 'star', label: 'Star+', img: require('../../assets/providers/star.png'), re: 'star ?\\+|starplus' },
  { key: 'crunchy', label: 'Crunchyroll', img: require('../../assets/providers/crunchy.png'), re: 'crunchy' },
];

const SLIDES = 10;
const SLIDE_MS = 7000;
const RECENT_RE = /lan[cç]amento|novidade|recente|2026|2025/i;

/** Embaralha de forma estável durante o dia (a recomendação muda por dia, não a cada abertura) */
function dailyShuffle<T>(list: T[]): T[] {
  let seed = Math.floor(Date.now() / 86400000) + 1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const num = (v: unknown) => Number(v) || 0;
const uniq = <T,>(list: T[], key: (i: T) => string | number) => {
  const seen = new Set<string | number>();
  return list.filter((i) => !seen.has(key(i)) && !!seen.add(key(i)));
};

/** Escolhe até 3 categorias sem conteúdo adulto: primeiro as de lançamentos, depois as demais. */
function pickCats(all: Category[]): Category[] {
  const list = all.filter((c) => !isAdultName(c.category_name));
  const recent = list.filter((c) => RECENT_RE.test(c.category_name));
  return [...recent, ...list.filter((c) => !recent.includes(c))].slice(0, 1);
}

// o aviso de vencimento aparece uma vez por abertura do app
let expShown = false;

export default function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const t = useTheme();
  const { panel, xtream, user } = useSession();
  const { width, height, wide } = useLayout();
  const scrollRef = useRef<ScrollView>(null);

  const [progress, setProgress] = useState<Progress[]>([]);
  const [movies, setMovies] = useState<VodStream[] | null>(null);
  const [recommended, setRecommended] = useState<VodStream[]>([]);
  const [hotMovies, setHotMovies] = useState<VodStream[]>([]);
  const [series, setSeries] = useState<Series[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [sCats, setSCats] = useState<Category[]>([]);
  const [slides, setSlides] = useState<VodStream[]>([]);
  const [infos, setInfos] = useState<Record<number, VodInfo>>({});
  const [idx, setIdx] = useState(0);
  const [askPin, setAskPin] = useState(false);
  const [askExit, setAskExit] = useState(false);
  const [askExp, setAskExp] = useState(false); // aviso: lista perto de vencer
  const [menuOpen, setMenuOpen] = useState(false); // celular deitado: menu escondido que abre pelo canto
  const [reload, setReload] = useState(0);
  const exiting = useRef(false); // true = o cliente confirmou a saída: deixa o Android fechar o app
  const [toast, setToast] = useState('');
  const [refreshing, setRefreshing] = useState(false); // mensagem "Carregando conteúdo" depois de tocar em Atualizar
  const [hiddenNotices, setHidden] = useState<(number | string)[]>([]);
  const parentalV = useParentalVersion();

  const sideHidden = false; // menu lateral FIXO (sempre visível em tela larga)

  useFocusEffect(
    useCallback(() => {
      loadProgress().then(setProgress);
    }, [parentalV]),
  );

  // Botão voltar na tela de início: pergunta se quer sair do aplicativo
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (exiting.current) return false; // o exitApp() chama este botão de novo: não pode interceptar
        if (menuOpen) setMenuOpen(false);
        else setAskExit(true);
        return true;
      });
      return () => sub.remove();
    }, [menuOpen]),
  );

  // Catálogo para as fileiras e o destaque (carrega de até 3 categorias, para ficar leve em aparelhos simples)
  useEffect(() => {
    if (!xtream) return;
    let alive = true;

    xtream
      .vodCategories()
      .then(async (c) => {
        if (!alive) return;
        setCats(c);
        const lists = await Promise.all(pickCats(c).map((k) => xtream.vodStreams(String(k.category_id)).catch(() => [] as VodStream[])));
        if (!alive) return;
        const all = uniq(lists.flat(), (m) => m.stream_id);
        const byAdded = [...all].sort((a, b) => num(b.added) - num(a.added));
        const recent = byAdded.slice(0, 40);
        setMovies(recent);
        // banner: os 10 últimos adicionados (com capa)
        const top = byAdded.filter((m) => m.stream_icon).slice(0, SLIDES);
        setSlides(top);
        // filmes em alta: os mais bem avaliados entre os adicionados recentemente
        setHotMovies([...byAdded.slice(0, 80)].filter((m) => num(m.rating) > 0 && m.stream_icon).sort((a, b) => num(b.rating) - num(a.rating)).slice(0, 20));
        // recomendado: sugestão do dia (varia a cada dia), fora os do banner
        const topIds = new Set(top.map((m) => m.stream_id));
        setRecommended(dailyShuffle(byAdded.filter((m) => m.stream_icon && !topIds.has(m.stream_id))).slice(0, 20));
        // se o cliente já assistiu filmes: recomenda do mesmo gênero/categoria (sem repetir os que ele já viu)
        try {
          const [taste, prog] = await Promise.all([loadTaste(), loadProgress()]);
          if (taste.length) {
            const seen = new Set<number>([...taste.map((t) => t.id), ...prog.filter((p) => p.kind === 'movie').map((p) => p.id)]);
            const score = new Map<string, number>();
            taste.slice(0, 30).forEach((t, i) => score.set(t.cat, (score.get(t.cat) || 0) + 1 + (30 - i) / 30));
            const favCats = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
            const picks = await Promise.all(favCats.map((c) => xtream.vodStreams(c).catch(() => [] as VodStream[])));
            if (!alive) return;
            const pool = uniq(picks.flat(), (m) => m.stream_id).filter((m) => m.stream_icon && !seen.has(m.stream_id));
            if (pool.length >= 6) {
              const best = [...pool].sort((a, b) => num(b.rating) - num(a.rating)).slice(0, 80);
              setRecommended(dailyShuffle(best).slice(0, 20));
            }
          }
        } catch {
          /* mantém a sugestão do dia */
        }
      })
      .catch(() => alive && setMovies([]));

    xtream
      .seriesCategories()
      .then(async (c) => {
        if (alive) setSCats(c);
        const lists = await Promise.all(pickCats(c).map((k) => xtream.series(String(k.category_id)).catch(() => [] as Series[])));
        const all = uniq(lists.flat(), (s) => s.series_id);
        const key = (s: Series) => num(s.last_modified);
        const recent = [...all].sort((a, b) => key(b) - key(a)).slice(0, 60);
        // séries em alta: as mais bem avaliadas entre as atualizadas recentemente
        const rated = recent.filter((s) => num(s.rating) > 0).sort((a, b) => num(b.rating) - num(a.rating));
        if (alive) setSeries((rated.length >= 8 ? rated : recent).slice(0, 20));
      })
      .catch(() => alive && setSeries([]));
    return () => {
      alive = false;
    };
  }, [xtream, parentalV, reload]);

  // troca o banner sozinho
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  // busca os detalhes (fundo, sinopse) do slide atual e do próximo
  useEffect(() => {
    if (!xtream || !slides.length) return;
    [slides[idx], slides[(idx + 1) % slides.length]].forEach((m) => {
      if (!m || infos[m.stream_id]) return;
      xtream
        .vodInfo(m.stream_id)
        .then((v) => setInfos((o) => (o[m.stream_id] ? o : { ...o, [m.stream_id]: v })))
        .catch(() => {});
    });
  }, [xtream, slides, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // some a mensagem quando as listas terminam de carregar (ou depois de 25 s, por segurança)
  useEffect(() => {
    if (!refreshing) return;
    if (movies !== null && series !== null) {
      const id = setTimeout(() => setRefreshing(false), 600);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setRefreshing(false), 25000);
    return () => clearTimeout(id);
  }, [refreshing, movies, series]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const notices = (panel?.notices || []).filter((n) => !hiddenNotices.includes(n.id));

  const sideW = wide && !sideHidden ? 190 : 0;
  const contentW = width - sideW - (wide ? 48 : 24);
  const cardW = wide ? Math.max(160, Math.min(210, contentW / 5.6)) : Math.min(190, width * 0.46);
  const heroH = wide ? Math.max(260, Math.min(380, height * 0.45)) : 230;

  const play = async (p: Progress) => {
    if (!xtream) return;
    // série: carrega a lista de episódios para o "Próximo episódio" funcionar também por aqui
    let episodes: { id: number; title: string; ext: string }[] | undefined;
    if (p.kind === 'episode' && p.seriesId) {
      try {
        const si = await xtream.seriesInfo(p.seriesId);
        const sname = si.info?.name || p.name.split(' · ')[0];
        episodes = groupEpisodes(si).flatMap((g) => g.episodes).map((e) => ({ id: Number(e.id), title: `${sname} · T${e.season} E${e.episode_num}`, ext: e.container_extension }));
      } catch {
        /* sem lista: só não aparece o botão */
      }
    }
    navigation.navigate('Player', {
      episodes,
      kind: p.kind,
      id: p.id,
      title: p.name,
      icon: p.icon,
      ext: p.ext,
      seriesId: p.seriesId,
      startAt: p.position,
      url: p.kind === 'movie' ? xtream.movieUrl(p.id, p.ext) : xtream.episodeUrl(p.id, p.ext),
    });
  };

  const cur = slides.length ? slides[Math.min(idx, slides.length - 1)] : null;
  const curInfo = cur ? infos[cur.stream_id] : undefined;
  const featured = cur ? { stream: cur, info: curInfo?.info, ext: curInfo?.movie_data?.container_extension || cur.container_extension || 'mp4' } : null;

  const playFeatured = () =>
    featured &&
    xtream &&
    navigation.navigate('Player', {
      kind: 'movie',
      id: featured.stream.stream_id,
      title: featured.info?.name || featured.stream.name,
      icon: featured.info?.movie_image || featured.stream.stream_icon,
      ext: featured.ext,
      url: xtream.movieUrl(featured.stream.stream_id, featured.ext),
    });

  // só mostra os atalhos de streaming que existem de fato nas categorias da conta
  const providers = useMemo(() => {
    const names = [...cats, ...sCats].map((c) => c.category_name);
    return PROVIDERS.filter((p) => names.some((n) => new RegExp(p.re, 'i').test(n)));
  }, [cats, sCats]);
  // conta de demonstração (usada na revisão das lojas): sem logos de marcas
  const isDemoUser = (user?.username || '').trim().toLowerCase() === 'demo';
  const showProviders = !isDemoUser && providers.length > 0;

  // nome e vencimento da conta (no topo)
  const expRaw = user?.exp_date;
  const expMs = expRaw && expRaw !== 'null' ? (Number(expRaw) > 100000 ? Number(expRaw) * 1000 : Date.parse(expRaw)) : NaN;
  const daysLeft = isFinite(expMs) ? Math.ceil((expMs - Date.now()) / 86400000) : null;

  // faltando 3 dias ou menos para vencer: avisa uma vez a cada abertura do app, até o cliente dar OK
  useEffect(() => {
    if (!expShown && daysLeft !== null && daysLeft <= 3 && daysLeft >= 0) {
      expShown = true;
      setAskExp(true);
    }
  }, [daysLeft]);

  /** Atualiza as listas: limpa o que estava guardado e baixa tudo de novo */
  const refreshLists = () => {
    (xtream as Xtream | null)?.clearCache();
    setMovies(null);
    setSeries(null);
    setSlides([]);
    setIdx(0);
    setReload((r) => r + 1);
    setRefreshing(true);
  };

  const onMenu = (key: string, go: (n: Nav) => void) => {
    setMenuOpen(false);
    if (key === 'home') return void scrollRef.current?.scrollTo({ y: 0, animated: true });
    if (key === 'adult') return setAskPin(true);
    if (key === 'refresh') return refreshLists();
    go(navigation);
  };

  // ---------- partes da tela ----------
  const MenuList = (
    <ScrollView contentContainerStyle={{ gap: 2, paddingBottom: 10 }} showsVerticalScrollIndicator={false}>
      {MENU.map((m) => (
        <Focusable
          key={m.key}
          onPress={() => onMenu(m.key, m.go)}
          style={({ focused }) => [st.sideItem, { backgroundColor: focused ? t.primary + '55' : 'transparent' }]}
          focusStyle={{ borderColor: 'transparent', transform: [{ scale: 1.03 }] }}
        >
          <Text style={st.sideIcon}>{m.icon}</Text>
          <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600', fontSize: 14 }}>
            {m.label}
          </Text>
        </Focusable>
      ))}
    </ScrollView>
  );

  const Sidebar = (
    <View style={[st.side, { width: 190 }]}>
      <View style={{ paddingHorizontal: 8, paddingVertical: 14 }}>
        <Brand />
      </View>
      {MenuList}
    </View>
  );

  const backdrop = featured ? firstBackdrop(featured.info?.backdrop_path) || featured.info?.cover_big || featured.info?.movie_image || featured.stream.stream_icon : undefined;
  const rating = Number(featured?.info?.rating ?? featured?.stream.rating);

  const Hero = (
    <View style={{ height: heroH, borderRadius: 20, overflow: 'hidden', backgroundColor: t.surface }}>
      {backdrop ? <Image source={{ uri: backdrop }} style={[StyleSheet.absoluteFill, { left: wide ? '30%' : 0 }]} contentFit="cover" transition={500} /> : null}
      <LinearGradient colors={[t.bg, t.bg + 'E6', 'transparent']} locations={[0, 0.38, 0.8]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['transparent', t.bg + 'CC']} start={{ x: 0, y: 0.5 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, padding: wide ? 26 : 16, justifyContent: 'flex-end', maxWidth: wide ? '62%' : '100%', gap: 8 }}>
        {featured ? (
          <>
            <Text style={{ color: t.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0.8 }}>ADICIONADO RECENTEMENTE</Text>
            <Text numberOfLines={2} style={{ color: '#fff', fontSize: wide ? 30 : 22, fontWeight: '900' }}>
              {featured.info?.name || featured.stream.name}
            </Text>
            <Text style={{ color: '#ddd', fontSize: 13 }}>
              {[featured.info?.releasedate?.slice(0, 4), rating > 0 ? `★ ${rating.toFixed(1)}` : null, featured.info?.genre, featured.info?.duration].filter(Boolean).join('  ·  ')}
            </Text>
            {featured.info?.plot ? (
              <Text numberOfLines={wide ? 3 : 2} style={{ color: '#e5e7eb', fontSize: wide ? 15 : 13, lineHeight: wide ? 21 : 18 }}>
                {featured.info.plot}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, alignItems: 'center' }}>
              <Focusable onPress={playFeatured} hasTVPreferredFocus style={[st.heroBtn, { backgroundColor: t.primary }]} focusStyle={{ borderColor: '#fff' }}>
                <Text style={st.heroBtnText}>▶  ASSISTIR</Text>
              </Focusable>
              <Focusable
                onPress={() => navigation.navigate('MovieDetail', { id: featured.stream.stream_id, name: featured.stream.name, icon: featured.stream.stream_icon })}
                style={[st.heroBtn, { backgroundColor: '#00000066', borderColor: '#ffffff55' }]}
                focusStyle={{ borderColor: t.primary }}
              >
                <Text style={st.heroBtnText}>ⓘ  MAIS INFORMAÇÕES</Text>
              </Focusable>
              {slides.length > 1 ? (
                <View style={{ flexDirection: 'row', gap: 6, marginLeft: 8 }}>
                  {slides.map((_, i) => (
                    <View key={i} style={{ width: i === idx ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === idx ? t.primary : '#ffffff55' }} />
                  ))}
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <Brand size="lg" />
            <Muted>{movies === null ? 'Carregando destaques…' : 'Bem-vindo! Escolha uma opção no menu.'}</Muted>
          </>
        )}
      </View>
    </View>
  );

  const AccountBar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
        {sideHidden ? (
          <Focusable onPress={() => setMenuOpen(true)} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.text, fontSize: 20 }}>☰</Text>
          </Focusable>
        ) : null}
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.primary + '55', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{(user?.username || '?').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: wide ? 16 : 14 }}>
            {user?.username || 'Usuário'}
          </Text>
          <Muted style={{ fontSize: 12 }}>Minha conta</Muted>
        </View>
      </View>
      <View style={[st.expPill, { backgroundColor: t.surface, borderColor: daysLeft !== null && daysLeft <= 7 ? t.warn : t.line }]}>
        <Text style={{ fontSize: 15 }}>📅</Text>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: wide ? 14 : 12 }}>
          Vence em {formatExp(expRaw)}
          {daysLeft !== null && daysLeft >= 0 ? `  ·  ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}` : ''}
        </Text>
      </View>
    </View>
  );

  const Row = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ gap: 10 }}>
      <Text style={{ color: t.accent, fontSize: wide ? 20 : 17, fontWeight: '800' }}>{title}</Text>
      {children}
    </View>
  );

  const movieRow = (title: string, data: VodStream[]) =>
    data.length ? (
      <Row title={title}>
        <FlatList
          horizontal
          data={data}
          keyExtractor={(m) => title + m.stream_id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
          initialNumToRender={8}
          windowSize={11}
          maxToRenderPerBatch={8}
          removeClippedSubviews={false}
          getItemLayout={(_, i) => ({ length: cardW + 12, offset: (cardW + 12) * i, index: i })}
          renderItem={({ item }) => (
            <WideCard
              width={cardW}
              title={item.name}
              image={item.stream_icon}
              rating={Number(item.rating) > 0 ? Number(item.rating) : undefined}
              subtitle="Filme"
              onPress={() => navigation.navigate('MovieDetail', { id: item.stream_id, name: item.name, icon: item.stream_icon })}
            />
          )}
        />
      </Row>
    ) : null;

  const Content = (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: wide ? 24 : 12, gap: 22, paddingBottom: 40 }}>
      {!wide ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Brand />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MENU.filter((m) => m.key !== 'home').map((m) => (
              <Focusable key={m.key} onPress={() => onMenu(m.key, m.go)} style={[st.chip, { backgroundColor: t.surface, borderColor: t.line }]}>
                <Text style={{ color: t.text, fontWeight: '700' }}>
                  {m.icon} {m.label}
                </Text>
              </Focusable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {AccountBar}

      {Hero}

      {notices.slice(0, 1).map((n) => (
        <Focusable key={n.id} onPress={() => setHidden((h) => [...h, n.id])} style={{ backgroundColor: t.surface, borderRadius: 14, padding: 14, borderColor: t.line }}>
          <Text style={{ color: t.accent, fontWeight: '800' }}>📢 {n.title}</Text>
          <Text style={{ color: t.text, marginTop: 4, lineHeight: 20 }}>{n.message}</Text>
          <Muted style={{ fontSize: 12, marginTop: 6 }}>Toque para fechar</Muted>
        </Focusable>
      ))}

      {showProviders ? (
        <FlatList
          horizontal
          data={providers}
          keyExtractor={(p) => p.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
          renderItem={({ item }) => (
            <Focusable
              onPress={() => navigation.navigate('Vod', { kind: 'movie', both: true, match: item.re, title: item.label })}
              style={[st.provider, { width: wide ? 120 : 92, height: wide ? 44 : 36 }]}
              focusStyle={{ borderColor: '#3B82F6', backgroundColor: '#ffffff' }}
            >
              <Image source={item.img} style={{ width: '100%', height: '100%' }} contentFit="contain" accessibilityLabel={item.label} />
            </Focusable>
          )}
        />
      ) : null}

      {progress.length ? (
        <Row title="Continuar assistindo">
          <FlatList
            horizontal
            data={progress}
            keyExtractor={(p) => p.kind + p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
            getItemLayout={(_, i) => ({ length: cardW + 12, offset: (cardW + 12) * i, index: i })}
            renderItem={({ item }) => (
              <WideCard width={cardW} title={item.name} image={item.icon} progress={item.duration ? item.position / item.duration : 0} subtitle={item.kind === 'episode' ? 'Episódio' : 'Filme'} onPress={() => play(item)} />
            )}
          />
        </Row>
      ) : null}

      {movieRow('Recomendado para você', recommended.length ? recommended : movies || [])}
      {movieRow('Filmes em alta', hotMovies)}

      {series?.length ? (
        <Row title="Séries em alta">
          <FlatList
            horizontal
            data={series}
            keyExtractor={(s) => 's' + s.series_id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
            initialNumToRender={8}
          windowSize={11}
          maxToRenderPerBatch={8}
          removeClippedSubviews={false}
          getItemLayout={(_, i) => ({ length: cardW + 12, offset: (cardW + 12) * i, index: i })}
            renderItem={({ item }) => (
              <WideCard
                width={cardW}
                title={item.name}
                image={item.cover}
                rating={Number(item.rating) > 0 ? Number(item.rating) : undefined}
                subtitle={item.genre || 'Série'}
                onPress={() => navigation.navigate('SeriesDetail', { id: item.series_id, name: item.name, cover: item.cover })}
              />
            )}
          />
        </Row>
      ) : null}
    </ScrollView>
  );

  return (
    <Screen padded={false}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {wide && !sideHidden ? Sidebar : null}
        {Content}
      </View>

      {/* celular deitado: toque no cantinho da tela abre o menu */}
      {sideHidden && !menuOpen ? <Pressable onPress={() => setMenuOpen(true)} style={st.edge} accessibilityLabel="Abrir menu" /> : null}
      {sideHidden && menuOpen ? (
        <View style={StyleSheet.absoluteFill}>
          <Pressable onPress={() => setMenuOpen(false)} style={[StyleSheet.absoluteFill, { backgroundColor: '#000000aa' }]} />
          <View style={[st.side, { width: 250, position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: t.bg + 'F2' }]}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 14 }}>
              <Brand />
            </View>
            {MenuList}
          </View>
        </View>
      ) : null}

      {refreshing ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ backgroundColor: t.surface, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 22, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: t.line }}>
            <ActivityIndicator size="large" color={t.primary} />
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>Atualizando conteúdo…</Text>
          </View>
        </View>
      ) : null}

      {toast ? (
        <View pointerEvents="none" style={st.toast}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{toast}</Text>
        </View>
      ) : null}

      <PinModal
        visible={askPin}
        onClose={() => setAskPin(false)}
        onOk={() => {
          setAskPin(false);
          navigation.navigate('Vod', { kind: 'movie', both: true, match: ADULT_MATCH, title: 'Adultos' });
        }}
      />

      <Modal visible={askExp} transparent animationType="fade" onRequestClose={() => setAskExp(false)}>
        <View style={{ flex: 1, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 420, backgroundColor: t.surface, borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: t.line }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Sua lista está para vencer</Text>
            <Text style={{ color: t.text, fontSize: 16 }}>
              {daysLeft === 0 ? 'Vence hoje.' : daysLeft === 1 ? 'Falta 1 dia para vencer.' : `Faltam ${daysLeft} dias para vencer.`}
            </Text>
            <Muted>Fale com seu fornecedor para renovar e não ficar sem acesso.</Muted>
            <Button title="OK" hasTVPreferredFocus onPress={() => setAskExp(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={askExit} transparent animationType="fade" onRequestClose={() => setAskExit(false)}>
        <View style={{ flex: 1, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 420, backgroundColor: t.surface, borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: t.line }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Sair do aplicativo?</Text>
            <Muted>Deseja fechar o EDPLAY agora?</Muted>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Ficar" variant="ghost" hasTVPreferredFocus onPress={() => setAskExit(false)} style={{ flex: 1 }} />
              <Button
                title="Sair"
                variant="danger"
                onPress={() => {
                  exiting.current = true;
                  setAskExit(false);
                  setTimeout(() => BackHandler.exitApp(), 50);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const st = StyleSheet.create({
  // menu transparente, sem moldura nem bordas
  side: { padding: 12, backgroundColor: 'transparent' },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 38, borderRadius: 10 },
  sideIcon: { fontSize: 16, width: 22, textAlign: 'center', color: '#fff' },
  heroBtn: { height: 48, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  heroBtnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.6 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99, borderWidth: 1 },
  expPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 40, borderRadius: 20, borderWidth: 1.5 },
  // logos de streaming: transparentes, menores e mais finas
  provider: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  edge: { position: 'absolute', left: 0, top: 70, bottom: 0, width: 16 },
  toast: { position: 'absolute', bottom: 28, alignSelf: 'center', backgroundColor: '#000000cc', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
});
