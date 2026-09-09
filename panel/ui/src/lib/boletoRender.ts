import { tamanosBoleto, textoNombre, textoSub, type BoletoData } from '../components/BoletoFace'
import boletoCss from '../components/boleto-face.css?raw'
import {
  BOLETO_BLANCO,
  BOLETO_NEGRO,
  COL_W,
  GEO,
  aplicarFuente,
  fuentesListas,
  partirLineas,
  type Ctx2D,
} from './boletoLayout'

/**
 * Cara del boleto APAISADA: 94 × 59 mm. El área imprimible real de la Brother
 * QL-800 en cinta continua 62 mm es 58.9 mm de ancho (cinta) × 94.2 mm de
 * largo (corte). El agente local gira 90° cualquier PNG apaisado (ancho > alto)
 * y lo encaja centrado en esa área, así que el panel genera el PNG tal cual se
 * ve en pantalla, sin girarlo: 1110 × 697 px a 300 dpi.
 */
export const BOLETO_W_MM = GEO.w
export const BOLETO_H_MM = GEO.h
/** Etiqueta física (para @page en el camino Chrome). */
export const ETIQUETA_W_MM = 62
export const ETIQUETA_H_MM = 100

const DPI = 300

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`No se cargó imagen: ${src.slice(0, 48)}`))
    img.src = src
  })
}

/**
 * PNG del boleto 94 × 59 mm @ 300 dpi (1110 × 697 px) para el print-bridge.
 * Papel térmico negro/rojo: solo blanco, negro y rojo puro; sin grises ni
 * gradientes. Misma geometría (en mm) que boleto-face.css → WYSIWYG.
 */
export async function renderBoletoPngBase64(data: BoletoData): Promise<string> {
  await fuentesListas()
  const mm = (n: number) => (n / 25.4) * DPI
  const w = Math.round(mm(GEO.w))
  const h = Math.round(mm(GEO.h))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d') as Ctx2D | null
  if (!ctx) throw new Error('Canvas no disponible')

  // Fondo blanco
  ctx.fillStyle = BOLETO_BLANCO
  ctx.fillRect(0, 0, w, h)

  // QR a la izquierda, centrado en vertical. El margen de 3 mm y el hueco de
  // 4 mm hacen de zona en blanco; no lleva texto encima ni debajo.
  const qrLado = mm(GEO.qr)
  const qrX = mm(GEO.pad)
  const qrY = (h - qrLado) / 2
  const qr = await loadImage(data.qrDataUrl)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qr, qrX, qrY, qrLado, qrLado)

  // Columna de texto (40 × 49 mm), centrada en vertical, alineada a la izquierda.
  const colX = qrX + qrLado + mm(GEO.hueco)
  const colW = mm(COL_W)
  const colH = mm(GEO.colH)
  const colTop = (h - colH) / 2
  const { nombreMm } = tamanosBoleto(data)

  ctx.save()
  ctx.beginPath()
  ctx.rect(colX, colTop, colW, colH)
  ctx.clip()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  // Sin banda del tipo: el nombre arranca arriba de la columna.
  let y = colTop

  // Nombre: negritas, tamaño auto-ajustado (misma cuenta que el DOM), hasta 4 líneas
  ctx.fillStyle = BOLETO_NEGRO
  aplicarFuente(ctx, 800, mm(nombreMm), GEO.nombreTracking)
  const lineaNombre = mm(nombreMm) * GEO.nombreLh
  const lineasNombre = partirLineas(textoNombre(data), 800, nombreMm, GEO.nombreTracking, COL_W).slice(
    0,
    GEO.nombreLineas,
  )
  lineasNombre.forEach((ln, i) => ctx.fillText(ln, colX, y + lineaNombre * (i + 0.5)))
  y += lineaNombre * lineasNombre.length

  // Subtítulo (empresa o plantel), hasta 2 líneas
  const sub = textoSub(data)
  if (sub) {
    y += mm(GEO.subGap)
    aplicarFuente(ctx, 700, mm(GEO.sub), GEO.subTracking)
    const lineaSub = mm(GEO.sub) * GEO.subLh
    partirLineas(sub, 700, GEO.sub, GEO.subTracking, COL_W)
      .slice(0, GEO.subLineas)
      .forEach((ln, i) => ctx.fillText(ln, colX, y + lineaSub * (i + 0.5)))
  }

  // Folio anclado al pie de la columna
  aplicarFuente(ctx, 800, mm(GEO.folio), GEO.folioTracking)
  ctx.fillText(data.folio, colX, colTop + colH - (mm(GEO.folio) * GEO.folioLh) / 2)
  ctx.restore()

  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}

/**
 * Ventana aislada solo con el boleto (camino Chrome, "Más opciones").
 * `@page` sigue siendo 62 × 100 porque la cinta sale en vertical; la cara es
 * apaisada 94 × 59, así que se gira 90° con CSS alrededor del centro de la
 * etiqueta: 59 mm quedan sobre los 62 de ancho y 94 sobre los 100 de largo,
 * centrados, igual que hace el agente local con el PNG apaisado.
 */
export function printBoletoIsolated(faceHtml: string): void {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=680')
  if (!w) throw new Error('Permite ventanas emergentes para imprimir')
  const doc = w.document
  doc.open()
  doc.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>ExperienceBT-QL-62x100</title>
  <style>
${boletoCss}
@page { size: ${ETIQUETA_W_MM}mm ${ETIQUETA_H_MM}mm; margin: 0; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: ${ETIQUETA_W_MM}mm !important;
  height: ${ETIQUETA_H_MM}mm !important;
  background: #fff !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
[data-boleto-print-root] {
  position: relative;
  width: ${ETIQUETA_W_MM}mm;
  height: ${ETIQUETA_H_MM}mm;
  overflow: hidden;
  background: #fff;
}
/* Giro de 90°: la cinta es vertical (62 × 100) y la cara apaisada (94 × 59).
   Se rota alrededor del centro para que quede centrada como con el agente. */
[data-boleto-face] {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  width: ${BOLETO_W_MM}mm !important;
  height: ${BOLETO_H_MM}mm !important;
  margin: 0 !important;
  transform-origin: center center !important;
  transform: translate(-50%, -50%) rotate(90deg) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
  </style>
</head>
<body>
  <div data-boleto-print-root>${faceHtml}</div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 280);
    });
  <\/script>
</body>
</html>`)
  doc.close()
}
