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

/** Brother QL-800, etiqueta precortada 62 × 29 mm (DK-11209, papel «62mm x 29mm»). */
const MM = 72 / 25.4
const W = 62 * MM
const H = 29 * MM

function acentoHex(tipo: string): string {
  const t = (tipo || '').toUpperCase()
  if (t.includes('ESTUDI') || t.includes('ALUMN')) return '#35d95c'
  if (t.includes('EMPRES') || t.includes('ELISA')) return '#ec1e63'
  return '#12b5b0'
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
    formato: '62×29 mm (etiqueta DK-11209)',
    qrDataUrl,
    acento: acentoHex(tipo),
  }
}

/**
 * PDF 62 × 29 mm print-ready (camino «Abrir PDF»): misma cara que el panel,
 * QR a la izquierda, nombre a la derecha y folio al pie, en blanco y negro.
 */
export async function boletoPdf(
  nombre: string,
  folio: string,
  _tipo: string,
  _subtitulo = '',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Gafete 62x29 — ${nombre}`)
  doc.setSubject('Brother QL-800 · 62mm x 29mm')
  doc.setProducer('FICTI Accesos')
  const page = doc.addPage([W, H])
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const negro = rgb(0, 0, 0)
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) })

  // Misma cara que el panel (59 × 23 mm = área imprimible), centrada en la etiqueta 62 × 29.
  const caraX = 1.5 * MM
  const caraY = 3 * MM
  const pad = 1 * MM
  const qrSide = 21 * MM
  const qrPng = await QRCode.toBuffer(folio, { errorCorrectionLevel: 'M', margin: 2, width: 320, type: 'png' })
  const qrImg = await doc.embedPng(qrPng)
  page.drawImage(qrImg, { x: caraX + pad, y: caraY + pad, width: qrSide, height: qrSide })

  // Columna de texto 34 × 21 mm: nombre (hasta 3 líneas, se reduce hasta caber) y folio al pie.
  const colX = caraX + pad + qrSide + 2 * MM
  const colW = 34 * MM
  const colBottom = caraY + pad
  const colTop = colBottom + 21 * MM
  const palabras = (nombre || '—').trim().toUpperCase().split(/\s+/)
  const partir = (size: number): string[] => {
    const lineas: string[] = []
    let actual = ''
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p
      if (actual && bold.widthOfTextAtSize(prueba, size) > colW) {
        lineas.push(actual)
        actual = p
      } else actual = prueba
    }
    if (actual) lineas.push(actual)
    return lineas
  }
  let size = 5.2 * MM
  let lineas = partir(size)
  while (size > 2.2 * MM && (lineas.length > 3 || lineas.some((l) => bold.widthOfTextAtSize(l, size) > colW))) {
    size -= 0.1 * MM
    lineas = partir(size)
  }
  lineas.slice(0, 3).forEach((l, i) => {
    page.drawText(l, { x: colX, y: colTop - size * 0.14 - size * 1.06 * (i + 1) + size * 0.2, size, font: bold, color: negro })
  })
  page.drawText(folio, { x: colX, y: colBottom + 0.4 * MM, size: 2.1 * MM, font: bold, color: negro })

  return doc.save()
}
