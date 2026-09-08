import QRCode from 'qrcode'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export type BoletoPayload = {
  nombre: string
  folio: string
  tipo: string
  subtitulo: string
  evento: string
  formato: string
  qrDataUrl: string
  acento: string
}

/** Brother QL-800 cinta continua 62 mm — un corte ~100 mm. */
const MM = 72 / 25.4
const W = 62 * MM
const H = 100 * MM

function acentoHex(tipo: string): string {
  const t = (tipo || '').toUpperCase()
  if (t.includes('ESTUDI') || t.includes('ALUMN')) return '#35d95c'
  if (t.includes('EMPRES') || t.includes('ELISA')) return '#ec1e63'
  return '#12b5b0'
}

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

export async function boletoPayload(
  nombre: string,
  folio: string,
  tipo: string,
  subtitulo = '',
): Promise<BoletoPayload> {
  const qrDataUrl = await QRCode.toDataURL(folio, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    color: { dark: '#000000', light: '#ffffff' },
  })
  return {
    nombre: (nombre || '—').trim(),
    folio,
    tipo: (tipo || 'Acreditación').trim(),
    subtitulo: (subtitulo || '').trim(),
    evento: 'FICTI · Tech Capital 2026',
    formato: '62×100 mm (cinta continua)',
    qrDataUrl,
    acento: acentoHex(tipo),
  }
}

/** PDF 62×100 mm print-ready para Brother QL-800 cinta continua. */
export async function boletoPdf(
  nombre: string,
  folio: string,
  tipo: string,
  subtitulo = '',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Gafete 62x100 — ${nombre}`)
  doc.setSubject('Brother QL-800 · 62mm Cinta continua · 100mm')
  doc.setProducer('FICTI Accesos')
  const page = doc.addPage([W, H])
  page.setSize(W, H)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const accent = hexRgb(acentoHex(tipo))
  const fondo = rgb(0.02, 0.043, 0.11)
  const panel = rgb(0.039, 0.078, 0.157)
  const tenue = rgb(0.576, 0.651, 0.769)
  const blanco = rgb(1, 1, 1)

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: fondo })
  const m = 6
  page.drawRectangle({
    x: m,
    y: m,
    width: W - 2 * m,
    height: H - 2 * m,
    borderColor: rgb(accent.r, accent.g, accent.b),
    borderWidth: 2.2,
  })

  const bandaH = 22
  page.drawRectangle({
    x: m + 2,
    y: H - m - bandaH - 2,
    width: W - 2 * m - 4,
    height: bandaH,
    color: panel,
  })
  const brand = 'FICTI  ·  TECH CAPITAL'
  page.drawText(brand, {
    x: W / 2 - bold.widthOfTextAtSize(brand, 7) / 2,
    y: H - m - 15,
    size: 7,
    font: bold,
    color: blanco,
  })

  const etiqueta = (tipo || 'ACREDITACIÓN').toUpperCase()
  page.drawText(etiqueta, {
    x: W / 2 - bold.widthOfTextAtSize(etiqueta, 7) / 2,
    y: H - m - bandaH - 14,
    size: 7,
    font: bold,
    color: rgb(accent.r, accent.g, accent.b),
  })

  const nombreTxt = (nombre || '—').trim().toUpperCase()
  let size = 11
  while (size > 7 && bold.widthOfTextAtSize(nombreTxt, size) > W - 18) size -= 0.5
  const nombreLine = nombreTxt.slice(0, 42)
  page.drawText(nombreLine, {
    x: W / 2 - bold.widthOfTextAtSize(nombreLine, size) / 2,
    y: H - m - bandaH - 32,
    size,
    font: bold,
    color: blanco,
  })

  let y = H - m - bandaH - 44
  if (subtitulo) {
    const sub = subtitulo.trim().toUpperCase().slice(0, 36)
    page.drawText(sub, {
      x: W / 2 - font.widthOfTextAtSize(sub, 6.5) / 2,
      y,
      size: 6.5,
      font,
      color: tenue,
    })
    y -= 10
  }
  const evento = 'FICTI · TECH CAPITAL 2026'
  page.drawText(evento, {
    x: W / 2 - font.widthOfTextAtSize(evento, 5.5) / 2,
    y,
    size: 5.5,
    font,
    color: tenue,
  })

  const qrPng = await QRCode.toBuffer(folio, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    type: 'png',
  })
  const qrImg = await doc.embedPng(qrPng)
  const qrSide = 36 * MM
  const pad = 4
  const placa = qrSide + pad * 2
  const px = (W - placa) / 2
  const py = 22
  page.drawRectangle({ x: px, y: py, width: placa, height: placa, color: blanco })
  page.drawImage(qrImg, { x: px + pad, y: py + pad, width: qrSide, height: qrSide })

  const pie = 'PRESENTA ESTE CÓDIGO EN PUERTA'
  page.drawText(pie, {
    x: W / 2 - font.widthOfTextAtSize(pie, 5) / 2,
    y: 14,
    size: 5,
    font,
    color: tenue,
  })
  page.drawText(folio, {
    x: W / 2 - bold.widthOfTextAtSize(folio, 8) / 2,
    y: 6,
    size: 8,
    font: bold,
    color: blanco,
  })

  return doc.save()
}
