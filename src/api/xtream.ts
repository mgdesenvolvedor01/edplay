import { fetchJSON, HttpError } from './http';

export type Category = { category_id: string; category_name: string; parent_id?: number };

export type LiveStream = {
  num?: number;
  name: string;
  stream_id: number;
  stream_icon?: string;
  epg_channel_id?: string | null;
  category_id: string;
  tv_archive?: number;
};

export type VodStream = {
  name: string;
  stream_id: number;
  stream_icon?: string;
  rating?: string | number;
  category_id: string;
  container_extension?: string;
  added?: string;
};

export type Series = {
  name: string;
  series_id: number;
  cover?: string;
  plot?: string;
  rating?: string | number;
  category_id: string;
  releaseDate?: string;
  genre?: string;
  last_modified?: string;
};

export type VodInfo = {
  info: {
    name?: string;
    plot?: string;
    description?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releasedate?: string;
    rating?: string | number;
    duration?: string;
    duration_secs?: number;
    movie_image?: string;
    cover_big?: string;
    backdrop_path?: string[] | string;
    youtube_trailer?: string;
  };
  movie_data: { stream_id: number; name: string; container_extension: string; category_id?: string | number };
};

export type Episode = {
  id: string;
  episode_num: number | string;
  title: string;
  container_extension: string;
  season: number;
  info?: { plot?: string; duration_secs?: number; duration?: string; movie_image?: string; rating?: string | number };
};

export type SeriesInfo = {
  info: Series & { cast?: string; director?: string; backdrop_path?: string[] | string };
  seasons?: { season_number: number; name?: string; cover?: string }[];
  episodes: Record<string, Episode[]> | Episode[];
};

export type UserInfo = {
  username: string;
  password: string;
  status: string;
  exp_date: string | null;
  is_trial: string;
  active_cons: string;
  max_connections: string;
  allowed_output_formats?: string[];
  auth: number;
};

export type EpgItem = { title: string; description: string; start: string; end: string; start_timestamp?: string; stop_timestamp?: string };

/** Decodifica base64 com UTF-8 (títulos do EPG vêm assim). */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64(s: string): string {
  if (!s) return '';
  try {
    const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
    let bits = 0;
    let acc = 0;
    let hex = '';
    for (const ch of clean) {
      acc = (acc << 6) | B64.indexOf(ch);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        hex += '%' + ((acc >> bits) & 0xff).toString(16).padStart(2, '0');
      }
    }
    return decodeURIComponent(hex); // UTF-8
  } catch {
    return s;
  }
}

export class Xtream {
  readonly base: string;
  private cache = new Map<string, Promise<any>>();

  /** Nome original do servidor quando o app fala direto com o IP (DNS seguro). */
  hostHeader?: string;

  constructor(server: string, public username: string, public password: string, hostHeader?: string) {
    this.base = server.replace(/\/+$/, '');
    this.hostHeader = hostHeader;
  }

  /** Cabeçalhos para as requisições e para o player de vídeo. */
  get headers(): Record<string, string> {
    return this.hostHeader ? { 'User-Agent': 'EDPLAY/1.0', Host: this.hostHeader } : { 'User-Agent': 'EDPLAY/1.0' };
  }

  private api<T>(action?: string, params: Record<string, string | number> = {}, useCache = true): Promise<T> {
    const q = new URLSearchParams({ username: this.username, password: this.password });
    if (action) q.set('action', action);
    Object.entries(params).forEach(([k, v]) => q.set(k, String(v)));
    const url = `${this.base}/player_api.php?${q.toString()}`;
    if (useCache && this.cache.has(url)) return this.cache.get(url)!;
    const p = fetchJSON<T>(url, { headers: this.headers }, 45000);
    if (useCache) {
      this.cache.set(url, p);
      p.catch(() => this.cache.delete(url));
    }
    return p;
  }

  clearCache() {
    this.cache.clear();
  }

  /** Faz login e devolve os dados da conta. Lança erro se usuário/senha estiverem errados. */
  async login(): Promise<UserInfo> {
    const r = await this.api<{ user_info?: UserInfo }>(undefined, {}, false);
    const u = r?.user_info;
    if (!u || Number(u.auth) !== 1) throw new HttpError('Usuário ou senha incorretos.');
    if (u.status && u.status !== 'Active') {
      const map: Record<string, string> = { Expired: 'Sua assinatura venceu.', Banned: 'Sua conta foi bloqueada.', Disabled: 'Sua conta está desativada.' };
      throw new HttpError(map[u.status] || `Conta ${u.status}.`);
    }
    return u;
  }

  liveCategories = () => this.api<Category[]>('get_live_categories').then(arr);
  vodCategories = () => this.api<Category[]>('get_vod_categories').then(arr);
  seriesCategories = () => this.api<Category[]>('get_series_categories').then(arr);
  /** Igual às de cima, mas com as categorias adultas (o controle parental troca estas funções). */
  liveCategoriesAll = () => this.liveCategories();
  vodCategoriesAll = () => this.vodCategories();
  seriesCategoriesAll = () => this.seriesCategories();
  /** Categorias sem nenhum filtro (nem adultos, nem as escondidas pelo cliente). */
  liveCategoriesRaw = () => this.liveCategories();
  vodCategoriesRaw = () => this.vodCategories();
  seriesCategoriesRaw = () => this.seriesCategories();

  liveStreams = (categoryId?: string) =>
    this.api<LiveStream[]>('get_live_streams', categoryId ? { category_id: categoryId } : {}).then(arr);
  vodStreams = (categoryId?: string) =>
    this.api<VodStream[]>('get_vod_streams', categoryId ? { category_id: categoryId } : {}).then(arr);
  series = (categoryId?: string) => this.api<Series[]>('get_series', categoryId ? { category_id: categoryId } : {}).then(arr);

  vodInfo = (id: number) => this.api<VodInfo>('get_vod_info', { vod_id: id });
  seriesInfo = (id: number) => this.api<SeriesInfo>('get_series_info', { series_id: id });

  async shortEpg(streamId: number, limit = 2): Promise<EpgItem[]> {
    const fix = (l?: EpgItem[]) => (l || []).map((e) => ({ ...e, title: b64(e.title), description: b64(e.description || '') }));
    try {
      const r = await this.api<{ epg_listings?: EpgItem[] }>('get_short_epg', { stream_id: streamId, limit }, false);
      const list = fix(r?.epg_listings);
      if (list.length) return list;
    } catch {
      /* tenta a reserva abaixo */
    }
    // reserva: guia completo do canal (alguns servidores só respondem por aqui)
    try {
      const r = await this.api<{ epg_listings?: EpgItem[] }>('get_simple_data_table', { stream_id: streamId }, false);
      const nowS = Date.now() / 1000;
      return fix(r?.epg_listings)
        .filter((e) => Number(e.stop_timestamp || 0) > nowS)
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  liveUrl(id: number, format: 'm3u8' | 'ts' = 'm3u8') {
    return `${this.base}/live/${enc(this.username)}/${enc(this.password)}/${id}.${format}`;
  }
  movieUrl(id: number, ext = 'mp4') {
    return `${this.base}/movie/${enc(this.username)}/${enc(this.password)}/${id}.${ext || 'mp4'}`;
  }
  episodeUrl(id: number | string, ext = 'mp4') {
    return `${this.base}/series/${enc(this.username)}/${enc(this.password)}/${id}.${ext || 'mp4'}`;
  }
}

const enc = encodeURIComponent;
function arr<T>(x: T[] | null | undefined | Record<string, T>): T[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x === 'object') return Object.values(x);
  return [];
}

/** Episódios agrupados por temporada, em ordem. */
export function groupEpisodes(info: SeriesInfo): { season: number; episodes: Episode[] }[] {
  const raw = info.episodes;
  const map = new Map<number, Episode[]>();
  if (Array.isArray(raw)) raw.forEach((e) => map.set(Number(e.season), [...(map.get(Number(e.season)) || []), e]));
  else Object.entries(raw || {}).forEach(([k, list]) => map.set(Number(k), arr(list)));
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, episodes]) => ({ season, episodes: episodes.sort((a, b) => Number(a.episode_num) - Number(b.episode_num)) }));
}

export function firstBackdrop(b?: string[] | string): string | undefined {
  if (!b) return undefined;
  return Array.isArray(b) ? b[0] : b;
}

/** "1722470400" (unix) ou "2025-08-01" -> "01/08/2025" */
export function formatExp(exp: string | null | undefined): string {
  if (!exp || exp === 'null') return 'Ilimitado';
  const n = Number(exp);
  const d = Number.isFinite(n) && n > 100000 ? new Date(n * 1000) : new Date(exp);
  return isNaN(d.getTime()) ? exp : d.toLocaleDateString('pt-BR');
}
