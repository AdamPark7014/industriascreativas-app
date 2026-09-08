/**
 * Cliente del agente local EXPERIENCEBT print-bridge (QL-800).
 * Solo 127.0.0.1 — no pasa por DigitalOcean.
 */

const STORAGE_KEY = 'ficti_print_agent_url'
const DEFAULT_URL = 'http://127.0.0.1:9631'

/** ZIP standalone del agente (panel_web static). */
export const PRINT_BRIDGE_ZIP_URL = '/static/print-bridge.zip'

export const PRINT_BRIDGE_HELP =
  'En esta PC: 1) conecta Brother QL-800 por USB 2) instala drivers Brother 3) descarga el agente, descomprime y ejecuta start.cmd'

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
  jobName?: string | null
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
      jobName?: string | null
      label?: { widthMm?: number; heightMm?: number; mediaName?: string | null }
    }
    return {
      ok: Boolean(data?.ok),
      reachable: Boolean(data?.reachable),
      printerName: data?.printerName ?? null,
      jobName: data?.jobName ?? null,
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
): Promise<{
  ok: boolean
  error?: string
  printer?: string
  paper?: string
  jobName?: string
  mediaName?: string
}> {
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
      | {
          ok?: boolean
          error?: string
          printer?: string
          paper?: string
          jobName?: string
          mediaName?: string
        }
      | null
    if (res.ok && data?.ok) {
      return {
        ok: true,
        printer: data.printer,
        paper: data.paper,
        jobName: data.jobName,
        mediaName: data.mediaName,
      }
    }
    return {
      ok: false,
      error: data?.error ?? `HTTP ${res.status} desde ${base}/print-label (sin fallback Chrome)`,
    }
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    const hint = /Failed to fetch|NetworkError|Load failed|fetch/i.test(msg)
      ? `Agente inaccesible en ${base} (¿offline o CORS?). Corre start.cmd — NO se usará Chrome.`
      : msg
    return { ok: false, error: hint }
  }
}
