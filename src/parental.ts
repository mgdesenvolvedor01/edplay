import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * Controle parental: esconde categorias e itens adultos (canais, filmes e séries)
 * enquanto o bloqueio estiver ligado. Para desligar é preciso a senha (PIN).
 * Vem LIGADO por padrão, com a senha 0000.
 */

export const DEFAULT_PIN = '0000';
const KEY = 'mg.parental';

type State = { locked: boolean; pin: string };
let state: State = { locked: true, pin: DEFAULT_PIN };

// nomes que indicam conteúdo adulto (categoria ou item)
const ADULT_RE =
  /(\bx{3}\b|\badult[oa]?s?\b|\+\s?18\b|\b18\s?\+|\[18\]|\(18\)|porn|er[oó]tic|playboy|brazzers|hustler|redlight|venus\s?tv|\bsex(o|y)?\b|sensual|\bhot\s?(tv|club)\b|private\s?(tv|gold))/i;

export const isAdultName = (name?: string | null) => !!name && ADULT_RE.test(name);

// liberação temporária (só até fechar o app): usada quando o cliente digita o PIN numa categoria adulta
let temp = false;
const locked = () => state.locked && !temp;

export const isLocked = () => locked();
export const isDefaultPin = () => state.pin === DEFAULT_PIN;

export async function loadParental(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v) {
      const p = JSON.parse(v);
      state = { locked: p.locked !== false, pin: typeof p.pin === 'string' && p.pin ? p.pin : DEFAULT_PIN };
    }
  } catch {
    /* fica o padrão: bloqueado */
  }
}

// avisa as telas quando o bloqueio muda (para recarregarem as listas)
let version = 0;
const listeners = new Set<(v: number) => void>();
function notify() {
  version += 1;
  listeners.forEach((fn) => fn(version));
}
/** Número que muda sempre que o bloqueio é ligado/desligado (use nas dependências do useEffect). */
export function useParentalVersion() {
  const [v, setV] = useState(version);
  useEffect(() => {
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

// ---------- Categorias escondidas (escolhidas nas Configurações) ----------
// chave: "live:ID", "movie:ID" ou "series:ID"
const HKEY = 'mg.hiddenCats';
let hidden = new Set<string>();
export const isHiddenCat = (kind: 'live' | 'movie' | 'series', id: string | number) => hidden.has(`${kind}:${id}`);
export const hiddenCount = (kind: 'live' | 'movie' | 'series') => [...hidden].filter((k) => k.startsWith(kind + ':')).length;
export async function loadHidden(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(HKEY);
    hidden = new Set(v ? (JSON.parse(v) as string[]) : []);
  } catch {
    hidden = new Set();
  }
}
export async function setHiddenCat(kind: 'live' | 'movie' | 'series', id: string | number, on: boolean): Promise<void> {
  const k = `${kind}:${id}`;
  if (on) hidden.add(k);
  else hidden.delete(k);
  notify();
  try {
    await AsyncStorage.setItem(HKEY, JSON.stringify([...hidden]));
  } catch {
    /* ignora */
  }
}

async function save() {
  notify();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignora */
  }
}

export const checkPin = (pin: string) => pin.trim() === state.pin;

/** Libera os adultos só nesta sessão (volta a bloquear quando o app é fechado). */
export function unlockTemp(pin: string): boolean {
  if (!checkPin(pin)) return false;
  temp = true;
  notify();
  return true;
}

/** Liga o bloqueio (não precisa de senha). */
export async function lockAdult() {
  temp = false;
  state = { ...state, locked: true };
  await save();
}

/** Desliga o bloqueio. Devolve false se a senha estiver errada. */
export async function unlockAdult(pin: string): Promise<boolean> {
  if (!checkPin(pin)) return false;
  state = { ...state, locked: false };
  await save();
  return true;
}

/** Troca a senha. Devolve false se a senha atual estiver errada. */
export async function changePin(current: string, next: string): Promise<boolean> {
  if (!checkPin(current)) return false;
  state = { ...state, pin: next.trim() };
  await save();
  return true;
}

type Cat = { category_id: string | number; category_name: string };
type Item = { name?: string; category_id?: string | number };

/**
 * Envolve a fonte de conteúdo (Xtream ou M3U) e filtra o que for adulto
 * em todas as telas (TV ao vivo, filmes, séries, busca e tela inicial).
 */
export function withParental<T extends object>(src: T): T {
  const s = src as any;
  type K = 'live' | 'movie' | 'series';
  const kindOf = (fn: string): K => (fn.startsWith('live') ? 'live' : fn.startsWith('vod') ? 'movie' : 'series');

  const adultIds = async (catFn: string): Promise<Set<string>> => {
    try {
      const cats: Cat[] = await s[catFn]();
      return new Set(cats.filter((c) => isAdultName(c.category_name)).map((c) => String(c.category_id)));
    } catch {
      return new Set();
    }
  };

  // categorias sem nenhum filtro (usadas na tela de "ocultar categorias")
  const raw = (fn: string) => (): Promise<Cat[]> => s[fn]();
  // categorias sem as escondidas pelo cliente, mas COM as adultas (aparecem com cadeado)
  const visible = (fn: string) => async (): Promise<Cat[]> => {
    const list: Cat[] = await s[fn]();
    return list.filter((c) => !isHiddenCat(kindOf(fn), c.category_id));
  };
  const cats = (fn: string) => async (): Promise<Cat[]> => {
    const list: Cat[] = await visible(fn)();
    return locked() ? list.filter((c) => !isAdultName(c.category_name)) : list;
  };

  const items = (fn: string, catFn: string) => async (categoryId?: string): Promise<Item[]> => {
    const list: Item[] = await s[fn](categoryId);
    const k = kindOf(catFn);
    const anyHidden = hiddenCount(k) > 0;
    if (!locked() && !anyHidden) return list;
    if (categoryId && isHiddenCat(k, categoryId)) return [];
    const ids = locked() ? await adultIds(catFn) : new Set<string>();
    if (categoryId && ids.has(String(categoryId))) return [];
    return list.filter(
      (i) => !(locked() && (ids.has(String(i.category_id)) || isAdultName(i.name))) && !(anyHidden && isHiddenCat(k, i.category_id ?? '')),
    );
  };

  const catFnOf = (k: K) => (k === 'live' ? 'liveCategories' : k === 'movie' ? 'vodCategories' : 'seriesCategories');
  const wrapped: Record<string, unknown> = {
    /** true se a categoria é adulta (usado para não gravar no histórico) */
    isAdultCategory: async (k: K, categoryId?: string | number | null): Promise<boolean> =>
      categoryId !== undefined && categoryId !== null && categoryId !== '' && (await adultIds(catFnOf(k))).has(String(categoryId)),
    liveCategories: cats('liveCategories'),
    vodCategories: cats('vodCategories'),
    seriesCategories: cats('seriesCategories'),
    liveStreams: items('liveStreams', 'liveCategories'),
    vodStreams: items('vodStreams', 'vodCategories'),
    series: items('series', 'seriesCategories'),
    // listas completas de categorias (inclui as adultas, que aparecem com cadeado e pedem o PIN)
    liveCategoriesAll: visible('liveCategories'),
    vodCategoriesAll: visible('vodCategories'),
    seriesCategoriesAll: visible('seriesCategories'),
    // listas sem nenhum filtro
    liveCategoriesRaw: raw('liveCategories'),
    vodCategoriesRaw: raw('vodCategories'),
    seriesCategoriesRaw: raw('seriesCategories'),
  };

  return new Proxy(s, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in wrapped) return wrapped[prop];
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  }) as T;
}
