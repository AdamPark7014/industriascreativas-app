import { tamanosBoleto, textoNombre, type BoletoData } from '../components/BoletoFace'
import boletoCss from '../components/boleto-face.css?raw'
import {
  BOLETO_BLANCO,
  BOLETO_NEGRO,
  COL_W,
  ETIQUETA,
  GEO,
  aplicarFuente,
  fuentesListas,
  partirLineas,
  type Ctx2D,
} from './boletoLayout'

/**
 * Cara del boleto APAISADA 59 × 23 mm = área imprimible de la etiqueta 62 × 29
 * (papel «62mm x 29mm»). La página es apaisada, así que el agente local no gira
 * el PNG: lo encaja a escala ≈1 en el área imprimible, centrado. 697 × 272 px a 300 dpi.
 */
export const BOLETO_W_MM = GEO.w
export const BOLETO_H_MM = GEO.h
/** Etiqueta física (para @page en el camino Chrome). */
export const ETIQUETA_W_MM = ETIQUETA.w
export const ETIQUETA_H_MM = ETIQUETA.h

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
 * PNG del boleto 59 × 23 mm @ 300 dpi (697 × 272 px) para el print-bridge.
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

  // QR a la izquierda, centrado en vertical. El margen y el hueco hacen de
  // zona en blanco; no lleva texto encima ni debajo.
  const qrLado = mm(GEO.qr)
  const qrX = mm(GEO.pad)
  const qrY = (h - qrLado) / 2
  const qr = await loadImage(data.qrDataUrl)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qr, qrX, qrY, qrLado, qrLado)

  // Columna de texto (34 × 21 mm), centrada en vertical, alineada a la izquierda.
  const colX = qrX + qrLado + mm(GEO.hueco)
  const colW = mm(COL_W)
  const colH = mm(GEO.colH)
  const colTop = (h - colH) / 2
  const { nombreMm } = tamanosBoleto(data)

  ctx.save()
  ctx.beginPath()
  // El recorte sube hasta el margen: los acentos de las mayúsculas sobresalen de la línea.
  ctx.rect(colX, colTop - mm(GEO.pad) / 2, colW, colH + mm(GEO.pad) / 2)
  ctx.clip()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  // Nombre: negritas, tamaño auto-ajustado (misma cuenta que el DOM), hasta 3 líneas
  ctx.fillStyle = BOLETO_NEGRO
  aplicarFuente(ctx, 800, mm(nombreMm), GEO.nombreTracking)
  const lineaNombre = mm(nombreMm) * GEO.nombreLh
  const topNombre = colTop + mm(nombreMm) * GEO.nombreAire
  partirLineas(textoNombre(data), 800, nombreMm, GEO.nombreTracking, COL_W)
    .slice(0, GEO.nombreLineas)
    .forEach((ln, i) => ctx.fillText(ln, colX, topNombre + lineaNombre * (i + 0.5)))

  // Folio pequeño anclado al pie de la columna
  aplicarFuente(ctx, 800, mm(GEO.folio), GEO.folioTracking)
  ctx.fillText(data.folio, colX, colTop + colH - (mm(GEO.folio) * GEO.folioLh) / 2)
  ctx.restore()

  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}

/**
 * Ventana aislada solo con el boleto (camino Chrome, "Más opciones").
 * `@page` es la etiqueta (62 × 29) y la cara (59 × 23) va centrada, sin giro.
 */
export function printBoletoIsolated(faceHtml: string): void {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=520,height=360')
  if (!w) throw new Error('Permite ventanas emergentes para imprimir')
  const doc = w.document
  doc.open()
  doc.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${ETIQUETA.trabajo}</title>
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
[data-boleto-face] {
  position: absolute !important;
  left: ${(ETIQUETA_W_MM - BOLETO_W_MM) / 2}mm !important;
  top: ${(ETIQUETA_H_MM - BOLETO_H_MM) / 2}mm !important;
  width: ${BOLETO_W_MM}mm !important;
  height: ${BOLETO_H_MM}mm !important;
  margin: 0 !important;
  transform: none !important;
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
