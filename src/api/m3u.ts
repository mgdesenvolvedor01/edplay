import { REQUEST_TIMEOUT } from '../config';
import { HttpError } from './http';
import type { Category, EpgItem, LiveStream, Series, SeriesInfo, UserInfo, VodInfo, VodStream } from './xtream';

type Entry = { id: number; name: string; logo?: string; group: string; url: string; kind: 'live' | 'vod' };

const attr = (line: string, key: string) => {
  const m = line.match(new RegExp(`${key}="([^"]*)"`, 'i'));
  return m ? m[1] : undefined;
};

/** Lê um arquivo M3U/M3U8 (#EXTINF) e separa em canais e filmes pelo endereço de cada item. */
export function parseM3u(text: string): Entry[] {
  const out: Entry[] = [];
  const lines = text.split(/\r?\n/);
  let info: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      info = line;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (info) {
      // o nome vem depois da vírgula que fica após o último atributo (atributos podem ter vírgula)
      const comma = info.indexOf(',', Math.max(0, info.lastIndexOf('"')));
      const name = (comma >= 0 ? info.slice(comma + 1) : '').trim() || attr(info, 'tvg-name') || 'Sem nome';
      const isVod = /\/(movie|series)\//i.test(line) || /\.(mp4|mkv|avi|mov|webm)(\?|$)/i.test(line);
      out.push({ id: out.length + 1, name, logo: attr(info, 'tvg-logo') || undefined, group: attr(info, 'group-title') || 'Outros', url: line, kind: isVod ? 'vod' : 'live' });
      info = null;
    }
  }
  return out;
}

/**
 * Fonte de conteúdo a partir de uma lista M3U comum.
 * Tem os mesmos métodos do cliente Xtream, para as telas funcionarem igual.
 */
export class M3uSource {
  readonly base = '';
  username = 'Lista M3U';
  password = '';
  private entries: Entry[] = [];
  private byId = new Map<number, Entry>();

  constructor(private url: string) {}

  async login(): Promise<UserInfo> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT * 3);
    let text = '';
    try {
      const res = await fetch(this.url, { signal: ctrl.signal, headers: { 'User-Agent': 'EDPLAY/1.0' } });
      if (!res.ok) throw new HttpError(`A lista respondeu com erro ${res.status}.`, res.status);
      text = await res.text();
    } catch (e: any) {
      if (e instanceof HttpError) throw e;
      throw new HttpError('Não foi possível baixar a lista M3U. Verifique o link no painel.');
    } finally {
      clearTimeout(t);
    }
    this.entries = parseM3u(text);
    if (!this.entries.length) throw new HttpError('A lista M3U está vazia ou em formato inválido.');
    this.byId = new Map(this.entries.map((e) => [e.id, e]));
    return { username: this.username, password: '', status: 'Active', exp_date: null, is_trial: '0', active_cons: '0', max_connections: '1', auth: 1 };
  }

  clearCache() {
    /* a lista fica em memória até sair do app */
  }

  private cats(kind: Entry['kind']): Category[] {
    const seen = new Set<string>();
    const out: Category[] = [];
    for (const e of this.entries) {
      if (e.kind !== kind || seen.has(e.group)) continue;
      seen.add(e.group);
      out.push({ category_id: kind + ':' + e.group, category_name: e.group });
    }
    return out;
  }

  private pick(kind: Entry['kind'], categoryId?: string) {
    const g = categoryId?.replace(/^(live|vod):/, '');
    return this.entries.filter((e) => e.kind === kind && (!g || e.group === g));
  }

  liveCategories = async () => this.cats('live');
  vodCategories = async () => this.cats('vod');
  seriesCategories = async (): Promise<Category[]> => [];

  liveStreams = async (categoryId?: string): Promise<LiveStream[]> =>
    this.pick('live', categoryId).map((e, i) => ({ num: i + 1, name: e.name, stream_id: e.id, stream_icon: e.logo, category_id: 'live:' + e.group }));
  vodStreams = async (categoryId?: string): Promise<VodStream[]> =>
    this.pick('vod', categoryId).map((e) => ({ name: e.name, stream_id: e.id, stream_icon: e.logo, category_id: 'vod:' + e.group, container_extension: 'mp4', added: String(e.id) }));
  series = async (_categoryId?: string): Promise<Series[]> => [];

  vodInfo = async (id: number): Promise<VodInfo> => {
    const e = this.byId.get(id);
    return { info: { name: e?.name, movie_image: e?.logo }, movie_data: { stream_id: id, name: e?.name || '', container_extension: 'mp4' } };
  };
  seriesInfo = async (_id: number): Promise<SeriesInfo> => ({ info: { name: '', series_id: 0, category_id: '' }, episodes: [] });
  shortEpg = async (_id: number, _limit?: number): Promise<EpgItem[]> => [];

  liveUrl(id: number, _format?: 'm3u8' | 'ts') {
    return this.byId.get(id)?.url || '';
  }
  movieUrl(id: number, _ext?: string) {
    return this.byId.get(id)?.url || '';
  }
  episodeUrl(_id: number | string, _ext?: string) {
    return '';
  }
}
