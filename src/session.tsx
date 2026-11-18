import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { canWatch, panelInit, PanelData, PanelError } from './api/panel';
import { UserInfo, Xtream } from './api/xtream';
import { M3uSource } from './api/m3u';
import { clearLogin, getPrefs, loadActiveServer, loadLogin, loadPrefs, loadServers, saveActiveServer, saveLogin, ServerEntry } from './storage';
import { loadHidden, loadParental, withParental } from './parental';
import { applyDns } from './api/dns';

export type Phase =
  | { name: 'loading'; message?: string }
  | { name: 'error'; message: string; keyMismatch?: boolean }
  | { name: 'maintenance' }
  | { name: 'update' }
  | { name: 'activation' }
  | { name: 'noserver' }
  | { name: 'login'; error?: string }
  | { name: 'main' };

type Session = {
  phase: Phase;
  panel: PanelData | null;
  xtream: Xtream | null;
  user: UserInfo | null;
  /** Consulta o painel de novo e decide a próxima tela */
  refresh: () => Promise<void>;
  /** Troca os dados do painel (ex.: depois de resgatar código) */
  applyPanel: (d: PanelData) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Troca para um servidor extra (ou volta para o do painel com null) e recarrega as listas */
  switchServer: (id: string | null) => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

// Login de demonstração: usuário "demo", senha "edplay" (lista com vídeos de licença livre)
const DEMO_M3U = 'https://painel.mgplay.top/demo.m3u';
const isDemo = (u: string, p: string) => u.trim().toLowerCase() === 'demo' && p.trim() === 'edplay';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const lastTried = useRef('');
  const [panel, setPanel] = useState<PanelData | null>(null);
  const [xtream, setXtream] = useState<Xtream | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);

  const tryLogin = useCallback(async (server: string, username: string, password: string) => {
    // conta de demonstração (para teste e para a revisão das lojas): só vídeos de uso livre
    if (isDemo(username, password)) {
      const src = new M3uSource(DEMO_M3U);
      const u = await src.login();
      setXtream(withParental(src) as unknown as Xtream);
      setUser(u);
      return src as unknown as Xtream;
    }
    // DNS seguro (opcional): tenta pelo IP; se não der certo, volta para o endereço normal
    const dnsMode = getPrefs().dns;
    if (dnsMode !== 'system') {
      try {
        const d = await applyDns(server, dnsMode);
        if (d.host) {
          const xi = new Xtream(d.base, username, password, d.host);
          const ui = await xi.login();
          setXtream(withParental(xi));
          setUser(ui);
          return xi;
        }
      } catch {
        /* segue com o DNS do aparelho */
      }
    }
    const x = new Xtream(server, username, password);
    const u = await x.login();
    x.clearCache(); // lista sempre nova ao abrir o app
    setXtream(withParental(x));
    setUser(u);
    return x;
  }, []);

  /** Servidor extra escolhido nas Configurações (se houver) */
  const openExtraServer = useCallback(async (): Promise<boolean> => {
    const id = await loadActiveServer();
    if (!id) return false;
    const e: ServerEntry | undefined = (await loadServers()).find((v) => v.id === id);
    if (!e) return false;
    try {
      if (!e.username && !e.password) {
        const src = new M3uSource(e.server);
        const u = await src.login();
        setXtream(withParental(src) as unknown as Xtream);
        setUser(u);
      } else {
        await tryLogin(e.server, e.username, e.password);
      }
      return true;
    } catch {
      return false; // não abriu: usa o servidor do painel
    }
  }, [tryLogin]);

  const applyPanel = useCallback(
    async (d: PanelData) => {
      setPanel(d);
      if (d.maintenance) return setPhase({ name: 'maintenance' });
      if (d.update) return setPhase({ name: 'update' });
      if (!canWatch(d)) return setPhase({ name: 'activation' });

      if (await openExtraServer()) return setPhase({ name: 'main' });

      // Lista M3U comum cadastrada no painel: abre direto, sem login
      if (d.playlist?.type === 'm3u' && d.playlist.url) {
        try {
          const src = new M3uSource(d.playlist.url);
          const u = await src.login();
          setXtream(withParental(src) as unknown as Xtream);
          setUser(u);
          return setPhase({ name: 'main' });
        } catch (e: any) {
          return setPhase({ name: 'error', message: e?.message || 'Não foi possível abrir a lista M3U.' });
        }
      }

      // 1) usuário/senha cadastrados no painel para este aparelho  2) login salvo no aparelho
      const creds = d.credentials || (await loadLogin());
      // sem servidor no painel: ainda permite entrar com a conta de demonstração
      if (!d.server && !(creds && isDemo(creds.username, creds.password))) {
        return creds ? setPhase({ name: 'noserver' }) : setPhase({ name: 'login', error: 'O revendedor ainda não cadastrou o servidor.' });
      }
      if (!creds) return setPhase({ name: 'login' });
      try {
        await tryLogin(d.server || '', creds.username, creds.password);
        setPhase({ name: 'main' });
      } catch (e: any) {
        setPhase({ name: 'login', error: e?.message });
      }
    },
    [tryLogin, openExtraServer],
  );

  const refresh = useCallback(async () => {
    setPhase({ name: 'loading' });
    try {
      await applyPanel(await panelInit());
    } catch (e: any) {
      setPhase({
        name: 'error',
        message: e?.message || 'Não foi possível conectar.',
        keyMismatch: e instanceof PanelError && e.code === 'key_mismatch',
      });
    }
  }, [applyPanel]);

  const login = useCallback(
    async (username: string, password: string) => {
      if (!panel?.server && !isDemo(username, password)) throw new Error('Servidor não configurado.');
      await tryLogin(panel?.server || '', username.trim(), password.trim());
      await saveLogin({ username: username.trim(), password: password.trim() });
      setPhase({ name: 'main' });
    },
    [panel, tryLogin],
  );

  const logout = useCallback(async () => {
    await clearLogin();
    xtream?.clearCache();
    setXtream(null);
    setUser(null);
    setPhase({ name: 'login' });
  }, [xtream]);

  const switchServer = useCallback(
    async (id: string | null) => {
      await saveActiveServer(id);
      await refresh();
    },
    [refresh],
  );

  // Tela de login esperando: se o revendedor adicionar a lista pelo MAC no painel, o app percebe sozinho,
  // mostra "Carregando conteúdo…" e entra com o login do cliente.
  useEffect(() => {
    if (phase.name !== 'login' && phase.name !== 'noserver' && phase.name !== 'activation') return;
    let alive = true;
    const tick = async () => {
      try {
        const d = await panelInit();
        if (!alive) return;
        const sig = JSON.stringify([d.server, d.credentials, d.playlist?.url]);
        if ((d.credentials || d.playlist?.url) && canWatch(d) && !d.maintenance && sig !== lastTried.current) {
          lastTried.current = sig; // se der erro (senha errada), não repete a mesma lista em loop
          alive = false;
          setPhase({ name: 'loading', message: 'Carregando conteúdo…' });
          await applyPanel(d);
        }
      } catch {
        /* sem rede agora: tenta de novo no próximo ciclo */
      }
    };
    const id = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phase.name, applyPanel]);

  useEffect(() => {
    // carrega o controle parental e as preferências antes de abrir as listas
    Promise.all([loadParental(), loadHidden(), loadPrefs()]).finally(refresh);
  }, [refresh]);

  const value = useMemo(
    () => ({ phase, panel, xtream, user, refresh, applyPanel, login, logout, switchServer }),
    [phase, panel, xtream, user, refresh, applyPanel, login, logout, switchServer],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession fora do SessionProvider');
  return s;
}

/** Atalho para telas que só existem depois do login */
export function useXtream(): Xtream {
  const { xtream } = useSession();
  if (!xtream) throw new Error('Sem login');
  return xtream;
}
