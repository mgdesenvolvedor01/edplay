import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type PlayItem = {
  url: string;
  title: string;
  kind: 'live' | 'movie' | 'episode';
  id: number;
  icon?: string;
  ext?: string;
  seriesId?: number;
  startAt?: number;
  /** Conteúdo adulto: não grava nada no histórico (continuar assistindo, último canal, recomendações) */
  noHistory?: boolean;
  /** Para séries: todos os episódios em ordem (permite "Próximo episódio" e passar sozinho ao terminar) */
  episodes?: { id: number; title: string; ext: string }[];
  /** Para TV ao vivo: lista para trocar de canal com ▲/▼ */
  channels?: { id: number; name: string; icon?: string }[];
};

export type RootStack = {
  Home: undefined;
  Live: { categoryId?: string; match?: string; title?: string } | undefined;
  /** match: palavras para filtrar categorias (ex.: "kids|infantil") */
  Vod: { kind: 'movie' | 'series'; categoryId?: string; match?: string; title?: string; both?: boolean };
  MovieDetail: { id: number; name: string; icon?: string };
  SeriesDetail: { id: number; name: string; cover?: string };
  Player: PlayItem;
  Search: undefined;
  Favorites: undefined;
  Settings: undefined;
};

export type ScreenProps<K extends keyof RootStack> = NativeStackScreenProps<RootStack, K>;
