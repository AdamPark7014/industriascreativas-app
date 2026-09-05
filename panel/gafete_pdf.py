# -*- coding: utf-8 -*-
"""Gafete de puerta 5×8: nombre grande + QR. Misma cara que el desk de registro."""
import io

import qrcode
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

# 5 in × 8 in (360 × 576 pt)
ANCHO = 5 * inch
ALTO = 8 * inch
PLATA = (0.75, 0.75, 0.75)
TINTA = (0.08, 0.08, 0.08)
TENUE = (0.42, 0.42, 0.42)


def construir(nombre: str, folio: str, tipo: str, subtitulo: str = "") -> bytes:
    buf = io.BytesIO()
    qr = qrcode.QRCode(border=1, box_size=8)
    qr.add_data(folio)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    qr_buf = io.BytesIO()
    img.save(qr_buf, format="PNG")
    qr_buf.seek(0)

    c = canvas.Canvas(buf, pagesize=(ANCHO, ALTO))
    c.setTitle(f"Gafete — {nombre}")
    c.setAuthor("GABOR FICTI")

    margen = 22
    c.setStrokeColorRGB(*PLATA)
    c.setLineWidth(1)
    c.rect(margen * 0.45, margen * 0.45, ANCHO - margen * 0.9, ALTO - margen * 0.9)

    y = ALTO - 48
    c.setFillColorRGB(*TINTA)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(ANCHO / 2, y, "GABOR")
    y -= 16
    c.setFillColorRGB(*PLATA)
    c.setFont("Helvetica", 8)
    c.drawCentredString(ANCHO / 2, y, (tipo or "ACREDITACIÓN").upper())
    y -= 12
    c.setStrokeColorRGB(*PLATA)
    c.setLineWidth(0.75)
    c.line(margen, y, ANCHO - margen, y)

    y -= 22
    c.setFillColorRGB(*PLATA)
    c.setFont("Helvetica", 8)
    c.drawCentredString(ANCHO / 2, y, "NOMBRE")
    y -= 28
    c.setFillColorRGB(*TINTA)
    c.setFont("Helvetica-Bold", 22)
    texto = (nombre or "—").strip()
    if len(texto) > 42:
        texto = texto[:41] + "…"
    c.drawCentredString(ANCHO / 2, y, texto)

    if subtitulo:
        y -= 18
        c.setFillColorRGB(*TENUE)
        c.setFont("Helvetica", 10)
        linea = subtitulo.strip()
        if len(linea) > 48:
            linea = linea[:47] + "…"
        c.drawCentredString(ANCHO / 2, y, linea)

    qr_lado = 2.35 * inch
    qr_x = (ANCHO - qr_lado) / 2
    qr_y = 78
    c.drawImage(ImageReader(qr_buf), qr_x, qr_y, qr_lado, qr_lado, mask="auto")

    c.setStrokeColorRGB(*PLATA)
    c.line(margen, 52, ANCHO - margen, 52)
    c.setFillColorRGB(*PLATA)
    c.setFont("Helvetica", 8)
    c.drawCentredString(ANCHO / 2, 34, f"{folio}  ·  Gafete 5×8")
    c.showPage()
    c.save()
    return buf.getvalue()
