import type { BoletoData } from '../components/BoletoFace'
import boletoCss from '../components/boleto-face.css?raw'

const W_MM = 62
const H_MM = 100

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`No se cargó imagen: ${src.slice(0, 48)}`))
    img.src = src
  })
}

/** PNG 62×100 mm @ 203 dpi (nativo Brother QL) para el print-bridge. */
export async function renderBoletoPngBase64(data: BoletoData): Promise<string> {
  const dpi = 203
  const w = Math.round((W_MM / 25.4) * dpi)
  const h = Math.round((H_MM / 25.4) * dpi)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')

  const mm = (n: number) => (n / 25.4) * dpi
  const accent = data.acento || '#12b5b0'

  ctx.fillStyle = '#050b1c'
  ctx.fillRect(0, 0, w, h)

  // Marco
  ctx.strokeStyle = accent
  ctx.lineWidth = mm(1.4)
  const m = mm(2.8)
  roundRect(ctx, m, m, w - 2 * m, h - 2 * m, mm(2))
  ctx.stroke()

  // Banda logos
  const bandaY = m + mm(1.2)
  const bandaH = mm(12)
  ctx.fillStyle = '#0a1428'
  roundRect(ctx, m + mm(1.5), bandaY, w - 2 * m - mm(3), bandaH, mm(1.5))
  ctx.fill()

  try {
    const [ficti, tech] = await Promise.all([
      loadImage('/static/img/ficti-logo.png'),
      loadImage('/static/img/tech-capital-logo.png'),
    ])
    const logoH = mm(5.5)
    const gap = mm(2.4)
    const fw = (ficti.width / ficti.height) * logoH
    const tw = (tech.width / tech.height) * logoH
    const total = fw + gap + tw
    let x = (w - total) / 2
    const ly = bandaY + (bandaH - logoH) / 2
    ctx.drawImage(ficti, x, ly, fw, logoH)
    x += fw + gap
    ctx.drawImage(tech, x, ly, tw, logoH)
  } catch {
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.round(mm(2.6))}px Segoe UI, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('FICTI  ·  TECH CAPITAL', w / 2, bandaY + bandaH / 2 + mm(0.9))
  }

  let y = bandaY + bandaH + mm(3.2)
  ctx.fillStyle = accent
  ctx.font = `800 ${Math.round(mm(2.4))}px Manrope, Segoe UI, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText((data.tipo || 'ACREDITACIÓN').toUpperCase(), w / 2, y)

  y += mm(2)
  ctx.strokeStyle = '#1b2b4d'
  ctx.lineWidth = mm(0.3)
  ctx.beginPath()
  ctx.moveTo(w * 0.15, y)
  ctx.lineTo(w * 0.85, y)
  ctx.stroke()

  y += mm(5)
  const nombre = (data.nombre || '—').toUpperCase()
  let size = mm(4.2)
  ctx.font = `800 ${Math.round(size)}px Manrope, Segoe UI, sans-serif`
  ctx.fillStyle = '#fff'
  while (size > mm(2.8) && ctx.measureText(nombre).width > w - mm(10)) {
    size -= mm(0.2)
    ctx.font = `800 ${Math.round(size)}px Manrope, Segoe UI, sans-serif`
  }
  wrapCentered(ctx, nombre, w / 2, y, w - mm(10), size * 1.15, 2)

  y += size * 1.15 * 2 + mm(1.5)
  if (data.subtitulo) {
    ctx.fillStyle = '#93a6c4'
    ctx.font = `600 ${Math.round(mm(2.3))}px Manrope, Segoe UI, sans-serif`
    wrapCentered(ctx, data.subtitulo.toUpperCase(), w / 2, y, w - mm(10), mm(2.8), 2)
    y += mm(6)
  }

  ctx.fillStyle = '#6b80a3'
  ctx.font = `500 ${Math.round(mm(2))}px Manrope, Segoe UI, sans-serif`
  ctx.fillText((data.evento || 'FICTI · TECH CAPITAL 2026').toUpperCase(), w / 2, y)

  const qr = await loadImage(data.qrDataUrl)
  const qrSide = mm(36)
  const pad = mm(2)
  const placa = qrSide + pad * 2
  const px = (w - placa) / 2
  const py = h - mm(18) - placa
  ctx.fillStyle = '#fff'
  roundRect(ctx, px, py, placa, placa, mm(2))
  ctx.fill()
  ctx.drawImage(qr, px + pad, py + pad, qrSide, qrSide)

  ctx.fillStyle = '#93a6c4'
  ctx.font = `500 ${Math.round(mm(1.9))}px Manrope, Segoe UI, sans-serif`
  ctx.fillText('PRESENTA ESTE CÓDIGO EN PUERTA', w / 2, h - mm(10))
  ctx.fillStyle = '#fff'
  ctx.font = `800 ${Math.round(mm(2.8))}px Manrope, Segoe UI, sans-serif`
  ctx.fillText(data.folio, w / 2, h - mm(5.5))

  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}

/** Ventana aislada solo con el gafete — @page 62×100, sin chrome del panel. */
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
@page { size: 62mm 100mm; margin: 0; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 62mm !important;
  height: 100mm !important;
  background: #fff !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
body { display: flex; align-items: flex-start; justify-content: center; }
[data-boleto-face] {
  width: 62mm !important;
  height: 100mm !important;
  margin: 0 !important;
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

function wrapCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines: number,
) {
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
}
