import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAdultName, isLocked } from './parental';

async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function setJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem espaço ou erro de escrita: ignora */
  }
}

// ---------- Login Xtream salvo ----------
export type SavedLogin = { username: string; password: string };
export const loadLogin = () => getJSON<SavedLogin | null>('mg.login', null);
export const saveLogin = (l: SavedLogin) => setJSON('mg.login', l);
export const clearLogin = () => AsyncStorage.removeItem('mg.login');

// ---------- Favoritos ----------
export type FavKind = 'live' | 'movie' | 'series';
export type Favorite = { kind: FavKind; id: number; name: string; icon?: string };

const loadAllFavorites = () => getJSON<Favorite[]>('mg.favs', []);
/** Favoritos visíveis (com o bloqueio de adultos ligado, os adultos ficam escondidos) */
export const loadFavorites = async () => {
  const list = await loadAllFavorites();
  return isLocked() ? list.filter((f) => !isAdultName(f.name)) : list;
};
export async function toggleFavorite(f: Favorite): Promise<Favorite[]> {
  const list = await loadAllFavorites();
  const i = list.findIndex((x) => x.kind === f.kind && x.id === f.id);
  if (i >= 0) list.splice(i, 1);
  else list.unshift(f);
  await setJSON('mg.favs', list);
  return isLocked() ? list.filter((x) => !isAdultName(x.name)) : list;
}

// ---------- Continuar assistindo ----------
export type Progress = {
  kind: 'movie' | 'episode';
  id: number; // stream_id do filme ou id do episódio
  name: string;
  icon?: string;
  ext: string;
  position: number; // segundos
  duration: number;
  seriesId?: number;
  updatedAt: number;
};

const loadAllProgress = () => getJSON<Progress[]>('mg.progress', []);
export const loadProgress = async () => {
  const list = await loadAllProgress();
  return isLocked() ? list.filter((p) => !isAdultName(p.name)) : list;
};
export async function saveProgress(p: Progress): Promise<void> {
  if (isAdultName(p.name)) return; // adulto nunca vai para o histórico
  const list = (await loadAllProgress()).filter((x) => !(x.kind === p.kind && x.id === p.id));
  // terminou (mais de 95%)? remove da lista
  const finished = p.duration > 0 && p.position / p.duration > 0.95;
  if (!finished) list.unshift(p);
  await setJSON('mg.progress', list.slice(0, 30));
  if (p.kind === 'episode' && p.seriesId) {
    await saveSeriesLast(p.seriesId, { epId: p.id, title: p.name, ext: p.ext, position: p.position, duration: p.duration, finished, updatedAt: p.updatedAt });
  }
}
export async function getProgress(kind: Progress['kind'], id: number): Promise<Progress | undefined> {
  return (await loadProgress()).find((x) => x.kind === kind && x.id === id);
}

// ---------- Último canal ----------
export const loadLastChannel = () => getJSON<number | null>('mg.lastLive', null);
export const saveLastChannel = async (id: number, name?: string, noHistory?: boolean): Promise<void> => {
  if (noHistory || isAdultName(name)) return; // adulto nunca vira "último canal"
  await setJSON('mg.lastLive', id);
};

// ---------- Histórico: limpar ----------
export const clearMovieHistory = () => AsyncStorage.multiRemove(['mg.progress', 'mg.seriesLast', 'mg.taste']);

// ---------- Gosto: filmes que o cliente abriu/assistiu (base do "Recomendado para você") ----------
export type Taste = { id: number; cat: string; at: number };
export const loadTaste = () => getJSON<Taste[]>('mg.taste', []);
export async function saveTaste(id: number, cat?: string | number): Promise<void> {
  if (cat === undefined || cat === null || cat === '') return;
  const list = (await loadTaste()).filter((t) => t.id !== id);
  list.unshift({ id, cat: String(cat), at: Date.now() });
  await setJSON('mg.taste', list.slice(0, 60));
}
export const clearLiveHistory = () => AsyncStorage.removeItem('mg.lastLive');

// ---------- Série: lembra o último episódio (mesmo depois de terminar) ----------
export type SeriesLast = { epId: number; title: string; ext: string; position: number; duration: number; finished: boolean; updatedAt: number };
const loadSeriesLastAll = () => getJSON<Record<string, SeriesLast>>('mg.seriesLast', {});
export const getSeriesLast = async (seriesId: number) => (await loadSeriesLastAll())[String(seriesId)];
export async function saveSeriesLast(seriesId: number, v: SeriesLast): Promise<void> {
  const all = await loadSeriesLastAll();
  all[String(seriesId)] = v;
  const keys = Object.keys(all);
  if (keys.length > 80) {
    keys.sort((a, b) => all[a].updatedAt - all[b].updatedAt).slice(0, keys.length - 80).forEach((k) => delete all[k]);
  }
  await setJSON('mg.seriesLast', all);
}

// ---------- Servidores extras (botão "Adicionar" nas configurações) ----------
export type ServerEntry = { id: string; name: string; server: string; username: string; password: string };
export const loadServers = () => getJSON<ServerEntry[]>('mg.servers', []);
export const saveServers = (l: ServerEntry[]) => setJSON('mg.servers', l);
/** id do servidor extra em uso (null = o do painel) */
export const loadActiveServer = () => getJSON<string | null>('mg.activeServer', null);
export const saveActiveServer = (id: string | null) => (id ? setJSON('mg.activeServer', id) : AsyncStorage.removeItem('mg.activeServer'));

// ---------- Preferências ----------
export type DnsMode = 'system' | 'google' | 'cloudflare' | 'opendns';
export type Prefs = { dns: DnsMode; fit: 'contain' | 'cover' | 'fill'; autoQuality: boolean };
const DEFAULT_PREFS: Prefs = { dns: 'system', fit: 'contain', autoQuality: true };
let prefs: Prefs = DEFAULT_PREFS;
export const getPrefs = () => prefs;
export async function loadPrefs(): Promise<Prefs> {
  prefs = { ...DEFAULT_PREFS, ...(await getJSON<Partial<Prefs>>('mg.prefs', {})) };
  return prefs;
}
export async function savePrefs(p: Partial<Prefs>): Promise<Prefs> {
  prefs = { ...prefs, ...p };
  await setJSON('mg.prefs', prefs);
  return prefs;
}
