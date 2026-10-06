/**
 * Geometría y medición compartidas del boleto apaisado (80 × 59 mm).
 *
 * La cara DOM (BoletoFace + boleto-face.css) y el PNG para el agente local
 * (renderBoletoPngBase64) toman de aquí los mismos números y eligen el tamaño
 * del nombre con la misma función: lo que se ve es lo que sale.
 *
 * Área imprimible real de la Brother QL-800 en cinta continua 62 mm:
 * 58.9 mm de ancho (cinta) × 94.2 mm de largo (corte). El agente gira 90°
 * cualquier PNG apaisado (ancho > alto) y lo encaja centrado ahí, así que el
 * panel dibuja el boleto tal cual se ve en pantalla, sin girarlo.
 *
 * 80 mm de largo: es lo que cabe en el porta-gafete del evento (pedido de Evy,
 * 05-10-2026). Como el alto (59) ya llena la cinta, el agente lo deja a escala
 * ≈1 y sale de 80 mm reales.
 */

/** Rojo del rollo DK-2251. El térmico solo tiene negro/rojo: se ignora `data.acento`. */
export const BOLETO_ROJO = '#e60012'
export const BOLETO_NEGRO = '#000000'
export const BOLETO_BLANCO = '#ffffff'

export const BOLETO_FUENTE = "Manrope, 'Segoe UI', system-ui, sans-serif"

/** Geometría en mm. Si cambias algo aquí, cambia boleto-face.css a juego. */
export const GEO = {
  /** Cara apaisada. */
  w: 80,
  h: 59,
  /** Margen interno mínimo. */
  pad: 3,
  /** Lado del QR (izquierda, centrado en vertical). 38 mm se lee sin problema en puerta. */
  qr: 38,
  /** Hueco entre el QR y la columna de texto. */
  hueco: 3,
  /** Alto de la columna de texto (centrada en vertical). Ancho: COL_W. */
  colH: 49,
  /** Nombre: auto-ajuste max→min, hasta 4 líneas. Solo QR + nombre + folio
      (sin banda del tipo desde 09-09-2026, sin empresa/plantel desde
      05-10-2026): el tipo sigue legible en el folio (EMPRESARIO-465). */
  nombreMax: 9,
  nombreMin: 3.2,
  nombreLh: 1.08,
  nombreLineas: 4,
  nombreTracking: 0.01,
  /** Folio pequeño anclado al pie de la columna. */
  folio: 2.8,
  folioLh: 1.2,
  folioTracking: 0.06,
} as const

/** Ancho de la columna de texto: 80 − 2·3 − 38 − 3 = 33 mm. */
export const COL_W = GEO.w - 2 * GEO.pad - GEO.qr - GEO.hueco

export type Ctx2D = CanvasRenderingContext2D & { letterSpacing?: string }

/** Fija fuente y tracking en un contexto 2D (tracking: Chrome 99+; si no existe se omite). */
export function aplicarFuente(ctx: Ctx2D, peso: number, sizePx: number, trackingEm = 0): void {
  ctx.font = `${peso} ${sizePx}px ${BOLETO_FUENTE}`
  if ('letterSpacing' in ctx) ctx.letterSpacing = trackingEm ? `${trackingEm}em` : '0px'
}

/** Canvas de medición: 20 px por mm sobra para medir texto. */
const PX_POR_MM = 20
let medidor: Ctx2D | null | undefined

function ctxMedidor(): Ctx2D | null {
  if (medidor !== undefined) return medidor
  if (typeof document === 'undefined') {
    medidor = null
    return medidor
  }
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 8
  medidor = (c.getContext('2d') as Ctx2D | null) ?? null
  return medidor
}

/** Ancho en mm de `texto` a `sizeMm`. Sin canvas (rarísimo) estima 0.62 em por carácter. */
export function medirMm(texto: string, peso: number, sizeMm: number, trackingEm = 0): number {
  const ctx = ctxMedidor()
  if (!ctx) return texto.length * sizeMm * (0.62 + trackingEm)
  aplicarFuente(ctx, peso, sizeMm * PX_POR_MM, trackingEm)
  return ctx.measureText(texto).width / PX_POR_MM
}

/**
 * Parte `texto` en líneas de ancho ≤ anchoMm, palabra a palabra (como el
 * navegador). No recorta: quien pinta aplica el tope de líneas
 * (-webkit-line-clamp en CSS, slice en el PNG). Una palabra más ancha que la
 * línea va sola.
 */
export function partirLineas(
  texto: string,
  peso: number,
  sizeMm: number,
  trackingEm: number,
  anchoMm: number,
): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean)
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (actual && medirMm(prueba, peso, sizeMm, trackingEm) > anchoMm) {
      lineas.push(actual)
      actual = palabra
    } else {
      actual = prueba
    }
  }
  if (actual) lineas.push(actual)
  return lineas.length ? lineas : ['']
}

export type AjusteFuente = {
  texto: string
  peso: number
  trackingEm: number
  anchoMm: number
  maxLineas: number
  maxMm: number
  minMm: number
}

/**
 * Mayor tamaño (mm, paso 0.1) entre maxMm y minMm con el que `texto` cabe en
 * ≤ maxLineas líneas de anchoMm sin que ninguna palabra desborde. Si ni en
 * minMm cabe, devuelve minMm: el CSS recorta con line-clamp y el PNG con clip.
 */
export function ajustarFuenteMm(a: AjusteFuente): number {
  for (let s = a.maxMm; s > a.minMm; s = Math.round((s - 0.1) * 10) / 10) {
    if (cabe(a, s)) return s
  }
  return a.minMm
}

function cabe(a: AjusteFuente, sizeMm: number): boolean {
  const lineas = partirLineas(a.texto, a.peso, sizeMm, a.trackingEm, a.anchoMm)
  if (lineas.length > a.maxLineas) return false
  return lineas.every((l) => medirMm(l, a.peso, sizeMm, a.trackingEm) <= a.anchoMm)
}

/**
 * Espera a Manrope 700/800. El canvas no dispara la descarga de fuentes web
 * (solo el DOM lo hace), así que se piden explícitamente antes de medir.
 */
export async function fuentesListas(): Promise<void> {
  const fuentes = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fuentes) return
  try {
    await Promise.all([fuentes.load(`800 20px ${BOLETO_FUENTE}`), fuentes.load(`700 20px ${BOLETO_FUENTE}`)])
    await fuentes.ready
  } catch {
    // Sin fuente web se mide con la de respaldo: misma cuenta en DOM y PNG.
  }
}
