/**
 * Medidor de velocidade da internet (download).
 * Baixa um arquivo de teste público (Cloudflare) e calcula Mbps.
 * Devolve null se não conseguir medir (sem internet / bloqueado).
 */
export async function measureSpeed(opts: { bytes?: number; timeoutMs?: number } = {}): Promise<number | null> {
  const bytes = opts.bytes ?? 4_000_000;
  const timeoutMs = opts.timeoutMs ?? 12000;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}&r=${t0}`, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const secs = Math.max(0.05, (Date.now() - t0) / 1000);
    return (buf.byteLength * 8) / secs / 1e6;
  } catch (e: any) {
    // estourou o tempo: a conexão é muito lenta (menos de ~1 Mbps nesse tamanho de teste)
    if (e?.name === 'AbortError') return (bytes * 8) / (timeoutMs / 1000) / 1e6 / 2;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Mbps aproximados que cada qualidade de canal ao vivo precisa (rank: 1=SD 2=HD 3=FHD 4=4K) */
export const NEED_MBPS: Record<number, number> = { 1: 2, 2: 4, 3: 8, 4: 25 };

export function qualityForSpeed(mbps: number): { label: string; text: string } {
  if (mbps >= 25) return { label: '4K', text: 'Excelente: roda até 4K' };
  if (mbps >= 8) return { label: 'FHD', text: 'Muito boa: roda Full HD' };
  if (mbps >= 4) return { label: 'HD', text: 'Boa: roda HD' };
  if (mbps >= 2) return { label: 'SD', text: 'Fraca: só qualidade SD' };
  return { label: 'SD', text: 'Muito fraca: pode travar' };
}
