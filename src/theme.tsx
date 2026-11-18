import React, { createContext, useContext } from 'react';

export type Theme = {
  primary: string;
  accent: string;
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  text: string;
  muted: string;
  ok: string;
  warn: string;
  bad: string;
};

export const defaultTheme: Theme = {
  primary: '#E50914',
  accent: '#FF5A5F',
  bg: '#0B0D17',
  surface: '#151927',
  surface2: '#1E2335',
  line: '#2A3046',
  text: '#EEF0F7',
  muted: '#8E95AB',
  ok: '#22C55E',
  warn: '#F59E0B',
  bad: '#F43F5E',
};

const isHex = (c?: string | null) => !!c && /^#[0-9a-f]{6}$/i.test(c);

/** Mistura duas cores hex (t = 0..1) */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function themeFrom(app?: { primary_color?: string; accent_color?: string; bg_color?: string } | null): Theme {
  const t = { ...defaultTheme };
  if (isHex(app?.primary_color)) t.primary = app!.primary_color!;
  if (isHex(app?.accent_color)) t.accent = app!.accent_color!;
  if (isHex(app?.bg_color)) {
    t.bg = app!.bg_color!;
    t.surface = mix(t.bg, '#ffffff', 0.05);
    t.surface2 = mix(t.bg, '#ffffff', 0.09);
    t.line = mix(t.bg, '#ffffff', 0.15);
  }
  return t;
}

const Ctx = createContext<Theme>(defaultTheme);
export const ThemeProvider = ({ value, children }: { value: Theme; children: React.ReactNode }) => (
  <Ctx.Provider value={value}>{children}</Ctx.Provider>
);
export const useTheme = () => useContext(Ctx);
