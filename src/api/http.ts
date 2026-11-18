import { REQUEST_TIMEOUT } from '../config';

export class HttpError extends Error {
  constructor(message: string, public status = 0, public body?: any) {
    super(message);
  }
}

export async function fetchJSON<T = any>(url: string, init: RequestInit = {}, timeout = REQUEST_TIMEOUT): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // mostra o começo da resposta (ajuda a descobrir bloqueio por país/IP, página de erro etc.)
      const snip = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
      throw new HttpError(`Resposta inválida do servidor (código ${res.status}).` + (snip ? `\n"${snip}"` : ' (vazia)'), res.status);
    }
    if (!res.ok) throw new HttpError(body?.message || `Erro ${res.status}`, res.status, body);
    return body as T;
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    if (e?.name === 'AbortError') throw new HttpError('O servidor demorou para responder. Verifique sua internet.');
    // data/hora errada no aparelho faz a conexão segura (https) falhar
    if (url.startsWith('https') && new Date().getFullYear() < 2025) {
      throw new HttpError('A data e a hora do aparelho estão erradas. Acerte em Configurações → Data e hora e tente de novo.');
    }
    const detail = String(e?.message || e || '').slice(0, 120);
    throw new HttpError('Sem conexão com o servidor. Verifique sua internet e a data/hora do aparelho.' + (detail ? `\n(${detail})` : ''));
  } finally {
    clearTimeout(t);
  }
}
