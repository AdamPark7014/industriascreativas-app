/**
 * Cliente del agente local EXPERIENCEBT print-bridge (QL-800).
 * Solo 127.0.0.1 — no pasa por DigitalOcean.
 *
 * El agente detecta solo el rollo cargado (monocromo o negro/rojo DK-2251):
 * fija el tipo de papel en el driver Brother, vigila la cola, cancela el job
 * si la impresora lo rechaza y reintenta con el otro modo. Aquí solo pedimos
 * `colorMode: 'auto'` y mostramos lo que respondió.
 */

import { ETIQUETA } from './boletoLayout'

const STORAGE_KEY = 'ficti_print_agent_url'
const DEFAULT_URL = 'http://127.0.0.1:9631'

/** ZIP standalone del agente (panel_web static). No requiere Node. */
export const PRINT_BRIDGE_ZIP_URL = '/static/print-bridge.zip'

/** Instalador de un solo clic dentro del ZIP. */
export const PRINT_BRIDGE_INSTALLER = 'Instalar-Impresora-QL.cmd'

export const PRINT_BRIDGE_HELP =
  `En esta PC: 1) conecta la Brother QL-800 por USB e instala su driver 2) descarga el agente (ZIP) y descomprímelo 3) doble clic en ${PRINT_BRIDGE_INSTALLER}. Una sola vez por PC: queda arrancado en segundo plano y se inicia con Windows.`

/** Aviso corto para el permiso de red local de Chrome (v152+). */
export const PRINT_BRIDGE_CHROME_HINT =
  'Si Chrome pregunta por acceso a dispositivos de tu red local, pulsa Permitir y vuelve a intentar.'

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

/**
 * Impresora elegida a mano en esta PC (cuando la QL-800 tiene otro nombre en
 * Windows y el agente no la reconoce sola). Vacío = detección automática.
 */
const PRINTER_KEY = 'ficti_print_printer'

export function getPrinterOverride(): string {
  try {
    return (localStorage.getItem(PRINTER_KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export function setPrinterOverride(name: string): void {
  const clean = name.trim()
  try {
    if (clean) localStorage.setItem(PRINTER_KEY, clean)
    else localStorage.removeItem(PRINTER_KEY)
  } catch {
    /* sin almacenamiento: solo esta carga */
  }
}

/** Modo de rollo que terminó funcionando en la Brother. */
export type PrintColorMode = 'mono' | 'redblack'

/** Lo que pedimos al agente: `auto` deja que él detecte el rollo. */
export type PrintColorModeRequest = 'auto' | PrintColorMode

export type PrintAttempt = {
  mode?: PrintColorMode
  source?: string
  result?: string
  status?: string
  jobId?: number | string | null
}

export type PrintAgentHealth = {
  ok: boolean
  /** true solo si el agente responde Y Windows tiene una QL-800 instalada (así lo reporta agent.ps1). */
  reachable: boolean
  /** true si hubo respuesta HTTP del agente (aunque no haya impresora). */
  agenteResponde: boolean
  /** Windows tiene listada la impresora resuelta (driver instalado). null = agente viejo. */
  printerListed?: boolean | null
  /** Todas las impresoras que Windows le enseña al agente (para elegir a mano). */
  printersAll?: string[]
  /** De dónde salió la impresora resuelta: override | env | auto | none. */
  printerSource?: string | null
  error?: string
  printerName?: string | null
  jobName?: string | null
  label?: { widthMm?: number; heightMm?: number; mediaName?: string | null }
  /** Último modo de rollo que imprimió bien, o null si aún no imprimió. */
  colorMode?: PrintColorMode | null
  agent?: 'node' | 'powershell'
  version?: string
  installed?: boolean
  /** false = Windows marca la QL-800 sin conexión (apagada o USB suelto); null = agente viejo o sin datos. */
  printerOnline?: boolean | null
  printerOnlineReason?: string | null
}

export type PrintAgentResult = {
  ok: boolean
  error?: string
  /** true si el agente contestó por HTTP (aunque fuera con error); false si no hubo red. */
  reachable?: boolean
  printer?: string
  paper?: string
  jobName?: string
  mediaName?: string
  colorMode?: PrintColorMode
  colorModeSource?: string
  watched?: 'printed' | 'timeout'
  jobStatus?: string
  jobId?: number | string | null
  attempts?: PrintAttempt[]
  windowsSynced?: boolean
}

/** "rollo negro/rojo" | "rollo monocromo" | null si el agente no lo reportó. */
export function describeColorMode(mode: PrintColorMode | null | undefined): string | null {
  if (mode === 'redblack') return 'rollo negro/rojo'
  if (mode === 'mono') return 'rollo monocromo'
  return null
}

/**
 * Chrome 152+: una página https que llama a http://127.0.0.1 debe declarar
 * el espacio de direcciones destino o el navegador puede bloquear el fetch.
 * `targetAddressSpace` no es estándar todavía; se tipa aparte para no
 * ensuciar `RequestInit`.
 */
type LoopbackRequestInit = RequestInit & { targetAddressSpace?: 'loopback' }

function loopbackInit(init: RequestInit = {}): RequestInit {
  const withSpace: LoopbackRequestInit = { ...init, targetAddressSpace: 'loopback' }
  return withSpace
}

function isNetworkFailure(cause: unknown): boolean {
  if (cause instanceof DOMException) {
    return cause.name === 'AbortError' || cause.name === 'TimeoutError' || cause.name === 'NetworkError'
  }
  const msg = cause instanceof Error ? cause.message : String(cause)
  return /Failed to fetch|NetworkError|Load failed|fetch|network/i.test(msg)
}

function isTimeout(cause: unknown): boolean {
  return cause instanceof DOMException && (cause.name === 'TimeoutError' || cause.name === 'AbortError')
}

/** Mensaje en español cuando el fetch ni siquiera llegó al agente. */
function explainNetworkError(base: string, cause: unknown): string {
  if (isTimeout(cause)) {
    return (
      `El agente de impresión en ${base} no respondió a tiempo. ` +
      'Revisa que la Brother QL-800 esté encendida y conectada por USB, y vuelve a intentar. ' +
      'No se usó Chrome para imprimir.'
    )
  }
  const raw = cause instanceof Error ? cause.message : String(cause)
  return (
    `No se pudo contactar al agente de impresión en ${base}. Dos causas posibles:\n` +
    `1) El agente no está instalado o no está arrancado en esta PC: descarga print-bridge.zip, descomprímelo y haz doble clic en ${PRINT_BRIDGE_INSTALLER} (una sola vez; queda arrancado y se inicia con Windows).\n` +
    '2) Chrome pidió permiso para acceder a dispositivos de tu red local y se bloqueó: pulsa Permitir en el aviso de Chrome (o revísalo en el candado de la barra de direcciones) y vuelve a intentar.\n' +
    `No se usó Chrome para imprimir. Detalle técnico: ${raw}`
  )
}

export async function probePrintAgent(baseUrl?: string): Promise<PrintAgentHealth> {
  const base = (baseUrl ?? getPrintAgentUrl()).replace(/\/$/, '')
  // Con impresora elegida a mano, el agente la resuelve con ?printer= (si existe en Windows).
  const elegida = getPrinterOverride()
  const url = `${base}/health${elegida ? `?printer=${encodeURIComponent(elegida)}` : ''}`
  try {
    const res = await fetch(url, loopbackInit({ signal: AbortSignal.timeout(4000) }))
    const data = (await res.json()) as {
      ok?: boolean
      reachable?: boolean
      printerListed?: boolean | null
      printersAll?: unknown
      printerSource?: string | null
      printerName?: string | null
      jobName?: string | null
      label?: { widthMm?: number; heightMm?: number; mediaName?: string | null }
      colorMode?: PrintColorMode | null
      agent?: 'node' | 'powershell'
      version?: string
      installed?: boolean
      printerOnline?: boolean | null
      printerOnlineReason?: string | null
    }
    return {
      printerOnline: typeof data?.printerOnline === 'boolean' ? data.printerOnline : null,
      printerOnlineReason: data?.printerOnlineReason ?? null,
      ok: Boolean(data?.ok),
      reachable: Boolean(data?.reachable),
      agenteResponde: true,
      printerListed: typeof data?.printerListed === 'boolean' ? data.printerListed : null,
      printersAll: Array.isArray(data?.printersAll)
        ? data.printersAll.map((p) => String(p ?? '').trim()).filter(Boolean)
        : undefined,
      printerSource: data?.printerSource ?? null,
      printerName: data?.printerName ?? null,
      jobName: data?.jobName ?? null,
      label: data?.label,
      colorMode: data?.colorMode ?? null,
      agent: data?.agent,
      version: data?.version,
      installed: data?.installed,
    }
  } catch (cause) {
    return {
      ok: false,
      reachable: false,
      agenteResponde: false,
      error: isNetworkFailure(cause)
        ? explainNetworkError(base, cause)
        : cause instanceof Error
          ? cause.message
          : 'Sin respuesta',
    }
  }
}

/** Qué le falta a esta PC para imprimir, según el último sondeo. null = todo bien. */
export type PrintDiag = {
  tipo: 'sin_agente' | 'sin_impresora'
  texto: string
  /** "HH:MM" del sondeo. */
  hora: string
  /** Impresoras que Windows le enseña al agente (solo en sin_impresora). */
  printersAll?: string[]
}

export function diagnosticar(h: PrintAgentHealth): PrintDiag | null {
  const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (!h.agenteResponde) {
    return {
      tipo: 'sin_agente',
      hora,
      texto: `Sin respuesta del agente en ${getPrintAgentUrl()} (comprobado a las ${hora}). O no está arrancado en esta PC, o Chrome bloqueó el acceso a la red local.`,
    }
  }
  const listada = h.printerListed ?? h.reachable
  if (!listada) {
    const lista = h.printersAll ?? []
    const version = h.version ? ` (v${h.version})` : ''
    const elegida = getPrinterOverride()
    let texto: string
    if (!lista.length) {
      texto = `El agente sí corre en esta PC${version}, pero no pudo listar NINGUNA impresora de Windows (comprobado a las ${hora}). Suele ser el agente arrancado antes de instalar el driver: vuelve a ejecutar el instalador para reiniciarlo.`
    } else if (elegida && !lista.includes(elegida)) {
      texto = `La impresora elegida a mano («${elegida}») ya no existe en Windows (comprobado a las ${hora}). Elige otra de la lista.`
    } else {
      texto = `El agente sí corre en esta PC${version} y Windows le enseña ${lista.length} impresora${lista.length === 1 ? '' : 's'}, pero ninguna se llama «QL-800» (comprobado a las ${hora}). Si tu Brother está en la lista con otro nombre, elígela abajo.`
    }
    return { tipo: 'sin_impresora', hora, texto, printersAll: lista }
  }
  return null
}

/**
 * Imprime el PNG del boleto vía GDI con el papel exacto del driver
 * (ETIQUETA.papel = «62mm x 29mm», etiqueta precortada DK-11209).
 * `colorMode: 'auto'` → el agente detecta el rollo (mono o negro/rojo) y reintenta solo.
 */
export async function printPngViaAgent(
  pngBase64: string,
  meta: { title: string; body?: string; footer?: string; colorMode?: PrintColorModeRequest },
  baseUrl?: string,
): Promise<PrintAgentResult> {
  const base = (baseUrl ?? getPrintAgentUrl()).replace(/\/$/, '')
  const png = pngBase64.replace(/^data:image\/\w+;base64,/, '')
  try {
    const res = await fetch(
      `${base}/print-label`,
      loopbackInit({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: meta.title,
          body: meta.body ?? '',
          footer: meta.footer ?? 'FICTI Accesos · QL',
          pngBase64: png,
          widthMm: ETIQUETA.w,
          heightMm: ETIQUETA.h,
          mediaName: ETIQUETA.papel,
          colorMode: meta.colorMode ?? 'auto',
          // Impresora elegida a mano en esta PC (vacío = la QL-800 que detecte el agente).
          printerName: getPrinterOverride() || undefined,
        }),
        signal: AbortSignal.timeout(45_000),
      }),
    )
    const data = (await res.json().catch(() => null)) as
      | {
          ok?: boolean
          error?: string
          printer?: string
          paper?: string
          jobName?: string
          mediaName?: string
          colorMode?: PrintColorMode
          colorModeSource?: string
          watched?: 'printed' | 'timeout'
          jobStatus?: string
          jobId?: number | string | null
          attempts?: PrintAttempt[]
          windowsSynced?: boolean
        }
      | null
    if (res.ok && data?.ok) {
      return {
        ok: true,
        reachable: true,
        printer: data.printer,
        paper: data.paper,
        jobName: data.jobName,
        mediaName: data.mediaName,
        colorMode: data.colorMode,
        colorModeSource: data.colorModeSource,
        watched: data.watched,
        jobStatus: data.jobStatus,
        jobId: data.jobId,
        attempts: Array.isArray(data.attempts) ? data.attempts : undefined,
        windowsSynced: data.windowsSynced,
      }
    }
    // El agente ya devuelve `error` en español y legible: se muestra tal cual.
    return {
      ok: false,
      reachable: true,
      error:
        data?.error ??
        `El agente en ${base} respondió HTTP ${res.status} sin detalle. No se usó Chrome para imprimir.`,
      colorMode: data?.colorMode,
      watched: data?.watched,
      jobStatus: data?.jobStatus,
      jobId: data?.jobId,
      attempts: Array.isArray(data?.attempts) ? data.attempts : undefined,
    }
  } catch (cause) {
    return {
      ok: false,
      reachable: false,
      error: isNetworkFailure(cause)
        ? explainNetworkError(base, cause)
        : cause instanceof Error
          ? cause.message
          : String(cause),
    }
  }
}
