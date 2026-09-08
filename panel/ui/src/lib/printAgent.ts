/**
 * Cliente del agente local EXPERIENCEBT print-bridge (QL-800).
 * Solo 127.0.0.1 — no pasa por DigitalOcean.
 */

const STORAGE_KEY = 'ficti_print_agent_url'
const DEFAULT_URL = 'http://127.0.0.1:9631'

export function getPrintAgentUrl(): string {
  const stored = (localStorage.getItem(STORAGE_KEY) ?? '').trim().replace(/\/$/, '')
  if (stored) return stored
  return DEFAULT_URL
}

export function setPrintAgentUrl(url: string): void {
  const clean = url.trim().replace(/\/$/, '')
  if (clean) localStorage.setItem(STORAGE_KEY, clean)
  else localStorage.removeItem(STORAGE_KEY)
}

export type PrintAgentHealth = {
  ok: boolean
  reachable: boolean
  error?: string
  printerName?: string | null
  label?: { widthMm?: number; heightMm?: number; mediaName?: string | null }
}

export async function probePrintAgent(baseUrl?: string): Promise<PrintAgentHealth> {
  const base = (baseUrl ?? getPrintAgentUrl()).replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) })
    const data = (await res.json()) as {
      ok?: boolean
      reachable?: boolean
      printerName?: string | null
      label?: { widthMm?: number; heightMm?: number; mediaName?: string | null }
    }
    return {
      ok: Boolean(data?.ok),
      reachable: Boolean(data?.reachable),
      printerName: data?.printerName,
      label: data?.label,
    }
  } catch (cause) {
    return {
      ok: false,
      reachable: false,
      error: cause instanceof Error ? cause.message : 'Sin respuesta',
    }
  }
}

/** Imprime PNG 62×100 vía GDI con media «62mm Cinta continua» (evita remap 29×90 de Chrome). */
export async function printPngViaAgent(
  pngBase64: string,
  meta: { title: string; body?: string; footer?: string },
  baseUrl?: string,
): Promise<{ ok: boolean; error?: string; printer?: string }> {
  const base = (baseUrl ?? getPrintAgentUrl()).replace(/\/$/, '')
  const png = pngBase64.replace(/^data:image\/\w+;base64,/, '')
  try {
    const res = await fetch(`${base}/print-label`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: meta.title,
        body: meta.body ?? '',
        footer: meta.footer ?? 'FICTI Accesos · QL',
        pngBase64: png,
        widthMm: 62,
        heightMm: 100,
        mediaName: '62mm Cinta continua',
      }),
      signal: AbortSignal.timeout(45_000),
    })
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; printer?: string }
      | null
    if (res.ok && data?.ok) return { ok: true, printer: data.printer }
    return { ok: false, error: data?.error ?? `HTTP ${res.status}` }
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error
          ? cause.message
          : 'Agente inaccesible — corre tools/print-bridge/start.cmd',
    }
  }
}
