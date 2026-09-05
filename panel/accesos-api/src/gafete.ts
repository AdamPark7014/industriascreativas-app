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
    formato: '5×8 in',
    qrDataUrl,
    acento: acentoHex(tipo),
  }
}

/** PDF 5×8 in print-ready (lean, no ReportLab). */
export async function boletoPdf(
  nombre: string,
  folio: string,
  tipo: string,
  subtitulo = '',
): Promise<Uint8Array> {
  const W = 5 * 72
  const H = 8 * 72
  const doc = await PDFDocument.create()
  const page = doc.addPage([W, H])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const accent = hexRgb(acentoHex(tipo))
  const fondo = rgb(0.02, 0.043, 0.11)
  const panel = rgb(0.039, 0.078, 0.157)
  const tenue = rgb(0.576, 0.651, 0.769)
  const blanco = rgb(1, 1, 1)

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: fondo })
  const m = 14
  page.drawRectangle({
    x: m,
    y: m,
    width: W - 2 * m,
    height: H - 2 * m,
    borderColor: rgb(accent.r, accent.g, accent.b),
    borderWidth: 4,
  })

  const bandaH = 72
  page.drawRectangle({
    x: m + 3,
    y: H - m - bandaH - 3,
    width: W - 2 * m - 6,
    height: bandaH,
    color: panel,
  })
  page.drawText('FICTI  ·  TECH CAPITAL', {
    x: W / 2 - 70,
    y: H - m - 42,
    size: 11,
    font: bold,
    color: blanco,
  })

  const etiqueta = (tipo || 'ACREDITACIÓN').toUpperCase()
  page.drawText(etiqueta, {
    x: W / 2 - bold.widthOfTextAtSize(etiqueta, 10) / 2,
    y: H - m - bandaH - 28,
    size: 10,
    font: bold,
    color: rgb(accent.r, accent.g, accent.b),
  })

  const nombreTxt = (nombre || '—').trim().toUpperCase()
  let size = 22
  while (size > 12 && bold.widthOfTextAtSize(nombreTxt, size) > W - 56) size -= 1
  page.drawText(nombreTxt.slice(0, 48), {
    x: W / 2 - bold.widthOfTextAtSize(nombreTxt.slice(0, 48), size) / 2,
    y: H / 2 + 40,
    size,
    font: bold,
    color: blanco,
  })
  if (subtitulo) {
    const sub = subtitulo.trim().toUpperCase().slice(0, 40)
    page.drawText(sub, {
      x: W / 2 - font.widthOfTextAtSize(sub, 10) / 2,
      y: H / 2 + 18,
      size: 10,
      font,
      color: tenue,
    })
  }
  page.drawText('FICTI · TECH CAPITAL 2026', {
    x: W / 2 - font.widthOfTextAtSize('FICTI · TECH CAPITAL 2026', 8) / 2,
    y: H / 2,
    size: 8,
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
  const qrSide = 2.55 * 72
  const pad = 14
  const placa = qrSide + pad * 2
  const px = (W - placa) / 2
  const py = 78
  page.drawRectangle({ x: px, y: py, width: placa, height: placa, color: blanco })
  page.drawImage(qrImg, { x: px + pad, y: py + pad, width: qrSide, height: qrSide })

  page.drawText('PRESENTA ESTE CÓDIGO EN PUERTA', {
    x: W / 2 - font.widthOfTextAtSize('PRESENTA ESTE CÓDIGO EN PUERTA', 8) / 2,
    y: 52,
    size: 8,
    font,
    color: tenue,
  })
  page.drawText(folio, {
    x: W / 2 - bold.widthOfTextAtSize(folio, 11) / 2,
    y: 34,
    size: 11,
    font: bold,
    color: blanco,
  })

  return doc.save()
}
