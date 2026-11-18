import type { DnsMode } from '../storage';

/**
 * DNS seguro (DNS sobre HTTPS). Só é usado quando o cliente escolhe Google, Cloudflare ou OpenDNS
 * nas Configurações. Descobre o IP do servidor por esse DNS e o app passa a falar com o IP
 * (mandando o nome original no cabeçalho "Host"). Só vale para servidores "http://"; se algo falhar,
 * o app volta sozinho para o DNS do aparelho.
 */
const DOH: Record<Exclude<DnsMode, 'system'>, string> = {
  google: 'https://dns.google/dns-query',
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  opendns: 'https://doh.opendns.com/dns-query',
};

export const DNS_LABEL: Record<DnsMode, string> = {
  system: 'DNS do aparelho (padrão)',
  google: 'Google DNS (8.8.8.8)',
  cloudflare: 'Cloudflare (1.1.1.1)',
  opendns: 'OpenDNS',
};

const B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function toBase64Url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64U[(n >> 18) & 63] + B64U[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64U[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64U[n & 63];
  }
  return out;
}

/** Monta uma pergunta DNS do tipo A (IPv4). */
function buildQuery(host: string): number[] {
  const b = [0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  host.split('.').forEach((label) => {
    b.push(label.length);
    for (const ch of label) b.push(ch.charCodeAt(0) & 0x7f);
  });
  b.push(0, 0, 1, 0, 1);
  return b;
}

/** Lê o primeiro endereço IPv4 da resposta DNS. */
function parseA(buf: Uint8Array): string | null {
  const an = (buf[6] << 8) | buf[7];
  let p = 12;
  const skipName = () => {
    while (p < buf.length) {
      const l = buf[p];
      if (l === 0) return void p++;
      if ((l & 0xc0) === 0xc0) return void (p += 2);
      p += l + 1;
    }
  };
  skipName();
  p += 4; // tipo + classe da pergunta
  for (let i = 0; i < an; i++) {
    skipName();
    const type = (buf[p] << 8) | buf[p + 1];
    const len = (buf[p + 8] << 8) | buf[p + 9];
    p += 10;
    if (type === 1 && len === 4) return `${buf[p]}.${buf[p + 1]}.${buf[p + 2]}.${buf[p + 3]}`;
    p += len;
  }
  return null;
}

const cache = new Map<string, { ip: string; at: number }>();

export async function resolveHost(host: string, mode: DnsMode): Promise<string | null> {
  if (mode === 'system' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const key = mode + ':' + host;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.ip;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${DOH[mode]}?dns=${toBase64Url(buildQuery(host))}`, { headers: { accept: 'application/dns-message' }, signal: ctrl.signal });
    if (!res.ok) return null;
    const ip = parseA(new Uint8Array(await res.arrayBuffer()));
    if (ip) cache.set(key, { ip, at: Date.now() });
    return ip;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Devolve o endereço do servidor já com o IP no lugar do nome (e o nome para o cabeçalho Host).
 * Se não for possível (https, IP direto, DNS do aparelho, falha na consulta), devolve o original.
 */
export async function applyDns(server: string, mode: DnsMode): Promise<{ base: string; host?: string }> {
  const m = server.trim().match(/^http:\/\/([^/:]+)(:\d+)?(\/.*)?$/i);
  if (!m || mode === 'system') return { base: server };
  const ip = await resolveHost(m[1], mode);
  if (!ip) return { base: server };
  return { base: `http://${ip}${m[2] || ''}${m[3] || ''}`.replace(/\/+$/, ''), host: m[1] + (m[2] || '') };
}
