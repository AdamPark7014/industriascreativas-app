import { BOLETO_MARCA, BOLETO_ROJO, type BoletoData } from '../components/BoletoFace'
import boletoCss from '../components/boleto-face.css?raw'

/**
 * Cara del boleto: 59 × 94 mm = área imprimible real de la Brother QL-800 en
 * cinta continua 62 mm (márgenes duros 1.5 mm lados / 2.8 mm arriba-abajo).
 * El agente local encaja el PNG dentro de esa área (contain + centrado), así
 * que a este tamaño sale 1:1 y centrado en la etiqueta 62 × 100.
 */
export const BOLETO_W_MM = 59
export const BOLETO_H_MM = 94
/** Etiqueta física (para @page en el camino Chrome). */
export const ETIQUETA_W_MM = 62
export const ETIQUETA_H_MM = 100

const DPI = 300
const NEGRO = '#000000'
const BLANCO = '#ffffff'
const FUENTE = "Manrope, 'Segoe UI', system-ui, sans-serif"

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`No se cargó imagen: ${src.slice(0, 48)}`))
    img.src = src
  })
}

type Ctx2D = CanvasRenderingContext2D & { letterSpacing?: string }

function setFont(ctx: Ctx2D, weight: number, sizePx: number, spacingEm = 0) {
  ctx.font = `${weight} ${Math.round(sizePx)}px ${FUENTE}`
  // Chrome 99+: mismo tracking que el CSS de la cara. Si no existe, se omite.
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacingEm ? `${spacingEm}em` : '0px'
}

/**
 * PNG del boleto 59×94 mm @ 300 dpi (697×1110 px) para el print-bridge.
 * Papel térmico negro/rojo: solo blanco, negro y rojo puro; sin grises ni
 * gradientes. Misma geometría (en mm) que boleto-face.css → WYSIWYG.
 */
export async function renderBoletoPngBase64(data: BoletoData): Promise<string> {
  const mm = (n: number) => (n / 25.4) * DPI
  const w = Math.round(mm(BOLETO_W_MM))
  const h = Math.round(mm(BOLETO_H_MM))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d') as Ctx2D | null
  if (!ctx) throw new Error('Canvas no disponible')

  const pad = mm(3)
  const cw = w - 2 * pad // ancho útil (53 mm)
  const cx = w / 2

  // Fondo blanco
  ctx.fillStyle = BLANCO
  ctx.fillRect(0, 0, w, h)

  // Marco fino negro a 1.2 mm del borde
  ctx.strokeStyle = NEGRO
  ctx.lineWidth = mm(0.5)
  roundRect(ctx, mm(1.2) + mm(0.25), mm(1.2) + mm(0.25), w - 2 * mm(1.45), h - 2 * mm(1.45), mm(1.5))
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Banda negra de marca (9 mm)
  let y = pad
  const brandH = mm(9)
  ctx.fillStyle = NEGRO
  roundRect(ctx, pad, y, cw, brandH, mm(1.2))
  ctx.fill()
  ctx.fillStyle = BLANCO
  setFont(ctx, 800, mm(3.1), 0.18)
  ctx.fillText(BOLETO_MARCA, cx, y + brandH / 2)
  y += brandH

  // Banda roja con el tipo (8 mm)
  y += mm(2)
  const tipoH = mm(8)
  ctx.fillStyle = BOLETO_ROJO
  roundRect(ctx, pad, y, cw, tipoH, mm(1.2))
  ctx.fill()
  ctx.fillStyle = BLANCO
  const tipo = (data.tipo || 'Acreditación').toUpperCase()
  let tipoSize = mm(4)
  setFont(ctx, 800, tipoSize, 0.14)
  while (tipoSize > mm(2.6) && ctx.measureText(tipo).width > cw - mm(2)) {
    tipoSize -= mm(0.2)
    setFont(ctx, 800, tipoSize, 0.14)
  }
  ctx.fillText(tipo, cx, y + tipoH / 2)
  y += tipoH

  // Nombre: 5 mm, hasta 2 líneas; solo se encoge si una palabra no cabe.
  y += mm(3)
  const nombre = (data.nombre || '—').toUpperCase()
  let size = mm(5)
  setFont(ctx, 800, size, 0.01)
  const palabraMasLarga = nombre.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '')
  while (size > mm(3.2) && ctx.measureText(palabraMasLarga).width > cw) {
    size -= mm(0.2)
    setFont(ctx, 800, size, 0.01)
  }
  ctx.fillStyle = NEGRO
  const lineaNombre = size * 1.12
  const nLineas = wrapCentered(ctx, nombre, cx, y + lineaNombre / 2, cw, lineaNombre, 2)
  y += lineaNombre * nLineas

  // Empresa / subtítulo: 2.7 mm, hasta 2 líneas
  if (data.subtitulo) {
    y += mm(1.4)
    setFont(ctx, 700, mm(2.7), 0.04)
    const lineaSub = mm(2.7) * 1.2
    const nSub = wrapCentered(ctx, data.subtitulo.toUpperCase(), cx, y + lineaSub / 2, cw, lineaSub, 2)
    y += lineaSub * nSub
  }

  // Evento: 2.2 mm
  y += mm(1.2)
  setFont(ctx, 600, mm(2.2), 0.1)
  const lineaEv = mm(2.2) * 1.2
  ctx.fillText((data.evento || 'FICTI · Tech Capital 2026').toUpperCase(), cx, y + lineaEv / 2)

  // Pie (anclado abajo): aviso 2 mm + folio 3.2 mm
  const avisoH = mm(2) * 1.2
  const folioH = mm(3.2) * 1.2
  const pieH = avisoH + mm(0.6) + folioH
  const pieTop = h - pad - pieH
  setFont(ctx, 600, mm(2), 0.08)
  ctx.fillText('PRESENTA ESTE CÓDIGO EN PUERTA', cx, pieTop + avisoH / 2)
  setFont(ctx, 800, mm(3.2), 0.04)
  ctx.fillText(data.folio, cx, pieTop + avisoH + mm(0.6) + folioH / 2)

  // QR 34 mm negro sobre blanco, justo encima del pie (margin-top:auto en CSS)
  const qrSide = mm(34)
  const qrY = pieTop - mm(1.5) - qrSide
  const qr = await loadImage(data.qrDataUrl)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qr, cx - qrSide / 2, qrY, qrSide, qrSide)

  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}

/** Ventana aislada solo con el boleto — @page 62×100, cara 59×94 centrada. */
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
  width: ${ETIQUETA_W_MM}mm;
  height: ${ETIQUETA_H_MM}mm;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}
[data-boleto-face] {
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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

/**
 * Dibuja `text` centrado en `cx`, partiendo en líneas de ancho ≤ maxW
 * (máximo `maxLines`; el resto se descarta como -webkit-line-clamp).
 * `y` es el centro vertical de la primera línea. Devuelve líneas dibujadas.
 */
function wrapCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word
    if (ctx.measureText(trial).width > maxW && cur) {
      lines.push(cur)
      cur = word
      if (lines.length >= maxLines) break
    } else {
      cur = trial
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur)
  lines.forEach((ln, i) => ctx.fillText(ln, cx, y + i * lineH))
  return Math.max(1, lines.length)
}
