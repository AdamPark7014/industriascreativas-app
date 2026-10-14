/**
 * Geometría y medición compartidas del boleto apaisado (62 × 29 mm).
 *
 * La cara DOM (BoletoFace + boleto-face.css) y el PNG para el agente local
 * (renderBoletoPngBase64) toman de aquí los mismos números y eligen el tamaño
 * del nombre con la misma función: lo que se ve es lo que sale.
 *
 * Desde el 14-10-2026 el boleto va en la etiqueta precortada Brother DK-11209
 * de 62 × 29 mm (papel «62mm x 29mm» del driver). Antes era 80 × 59 girado
 * sobre un corte de 62 × 100. Como la página es apaisada, el agente local NO
 * gira el PNG (solo gira cuando el área imprimible es vertical) y lo encaja a
 * escala en el área imprimible, centrado.
 *
 * La cara mide lo que la QL-800 puede imprimir en esa etiqueta: 58.9 × 22.9 mm
 * (PrintableArea del driver, medido el 14-10-2026). Si la cara midiera 62 × 29
 * el agente la encogería a 49 × 23 y dejaría franjas vacías a los lados.
 */

/** Etiqueta física y nombre exacto del papel en el driver Brother QL-800. */
export const ETIQUETA = {
  w: 62,
  h: 29,
  /** PaperName del driver (System.Drawing). El agente lo busca por nombre exacto. */
  papel: '62mm x 29mm',
  /** Nombre del trabajo en la cola de Windows. */
  trabajo: 'ExperienceBT-QL-62x29',
} as const

/** Rojo del rollo DK-2251. El térmico solo tiene negro/rojo: se ignora `data.acento`. */
export const BOLETO_ROJO = '#e60012'
export const BOLETO_NEGRO = '#000000'
export const BOLETO_BLANCO = '#ffffff'

export const BOLETO_FUENTE = "Manrope, 'Segoe UI', system-ui, sans-serif"

/** Geometría en mm. Si cambias algo aquí, cambia boleto-face.css a juego. */
export const GEO = {
  /** Cara apaisada = área imprimible de la etiqueta 62 × 29. */
  w: 59,
  h: 23,
  /** Margen interno mínimo (los márgenes duros de la impresora quedan fuera). */
  pad: 1,
  /** Lado del QR (izquierda, centrado en vertical): todo el alto útil. */
  qr: 21,
  /** Hueco entre el QR y la columna de texto. */
  hueco: 2,
  /** Alto de la columna de texto (centrada en vertical). Ancho: COL_W. */
  colH: 21,
  /** Nombre: auto-ajuste max→min, hasta 3 líneas. Solo QR + nombre + folio:
      el tipo sigue legible en el folio (EMPRESARIO-465). */
  nombreMax: 5.2,
  nombreMin: 2.2,
  nombreLh: 1.06,
  nombreLineas: 3,
  nombreTracking: 0.01,
  /** Aire sobre la primera línea (em) para que no se corten los acentos de las mayúsculas (Á, É, Í). */
  nombreAire: 0.14,
  /** Folio pequeño anclado al pie de la columna. */
  folio: 2.1,
  folioLh: 1.15,
  folioTracking: 0.06,
} as const

/** Ancho de la columna de texto: 59 − 2·1 − 21 − 2 = 34 mm. */
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
