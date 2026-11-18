import { PANEL_API_URL } from '../config';
import { getIdentity } from '../device';
import { fetchJSON, HttpError } from './http';

export type DeviceState = 'trial' | 'active' | 'expired' | 'blocked';

export type PanelData = {
  ok: true;
  app: {
    name: string;
    primary_color: string;
    accent_color: string;
    bg_color: string;
    logo_url: string | null;
    login_bg_url: string | null;
    support_whatsapp: string | null;
    support_url: string | null;
    support_text: string;
  };
  maintenance: { text: string } | null;
  update: { min_version: string; url: string | null; text: string } | null;
  device: {
    mac: string;
    key: string;
    state: DeviceState;
    state_label: string;
    expires_at: string | null;
    lifetime: boolean;
    days_left: number | null;
    client_name: string | null;
  };
  server: string | null;
  credentials: { username: string; password: string } | null;
  /** lista M3U comum cadastrada no painel para este aparelho */
  playlist?: { type: 'm3u'; url: string } | null;
  notices: { id: number | string; title: string; message: string; created_at: string }[];
  banners: { id: number | string; title: string | null; image_url: string }[];
};

export class PanelError extends HttpError {
  constructor(message: string, public code: string, status = 0) {
    super(message, status);
  }
}

async function call(action: 'init' | 'redeem', extra: Record<string, string> = {}): Promise<PanelData> {
  const id = await getIdentity();
  const go = () =>
    fetchJSON<PanelData>(PANEL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action, mac: id.mac, key: id.key, model: id.model, version: id.version, ...extra }),
    });
  try {
    try {
      return await go();
    } catch (e: any) {
      // falha de rede (Wi-Fi ainda conectando ao ligar a TV): espera um pouco e tenta mais uma vez
      if (e instanceof HttpError && !e.status) {
        await new Promise((r) => setTimeout(r, 2500));
        return await go();
      }
      throw e;
    }
  } catch (e: any) {
    if (e instanceof HttpError && e.body?.error) throw new PanelError(e.body.message, e.body.error, e.status);
    throw e;
  }
}

export const panelInit = () => call('init');
export const panelRedeem = (code: string) => call('redeem', { code: code.replace(/\D/g, '') });

// Sem ativação: o app vai direto para usuário e senha. Só não entra aparelho BLOQUEADO no painel.
export const canWatch = (d: PanelData) => d.device.state !== 'blocked';
