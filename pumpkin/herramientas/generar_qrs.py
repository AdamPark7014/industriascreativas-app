"""
Hojas para imprimir los 250 pases PUMPKIN con QR reales (QR-001 … QR-250).

La plantilla que mandó el cliente (250-QRS.pdf) traía el mismo dibujo de QR en las 250
celdas y ese dibujo no es un QR legible. Esta versión respeta el acomodo (A4, 5 × 10 por
hoja, 5 hojas, etiqueta "QR-[ID]") y cada QR contiene su propio código.

    py -3.12 pumpkin/herramientas/generar_qrs.py pumpkin/entregables/PUMPKIN-250-QR.pdf
"""
import sys

import qrcode
from qrcode.constants import ERROR_CORRECT_M
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

TOTAL = 250
COLS, FILAS = 5, 10
POR_HOJA = COLS * FILAS
MARGEN_X, ARRIBA, ABAJO = 12 * mm, 30 * mm, 12 * mm
LADO_QR = 17 * mm  # 21 módulos de ~0.8 mm: lo lee cualquier PDA; deja zona blanca arriba y abajo


def codigo(n: int) -> str:
    return f"QR-{n:03d}"


def matriz(texto: str) -> list[list[bool]]:
    q = qrcode.QRCode(error_correction=ERROR_CORRECT_M, border=0, box_size=1)
    q.add_data(texto)
    q.make(fit=True)
    return q.get_matrix()


def dibujar_qr(c: canvas.Canvas, texto: str, x: float, y: float, lado: float) -> None:
    m = matriz(texto)
    n = len(m)
    paso = lado / n
    c.setFillColorRGB(0, 0, 0)
    for f, fila in enumerate(m):
        col = 0
        while col < n:
            if fila[col]:
                ini = col
                while col < n and fila[col]:
                    col += 1
                # Un rectángulo por tramo horizontal: menos objetos y sin rayas entre módulos.
                c.rect(x + ini * paso, y + lado - (f + 1) * paso, (col - ini) * paso, paso, stroke=0, fill=1)
            else:
                col += 1


def generar(salida: str) -> None:
    ancho, alto = A4
    hojas = (TOTAL + POR_HOJA - 1) // POR_HOJA
    celda_w = (ancho - 2 * MARGEN_X) / COLS
    celda_h = (alto - ARRIBA - ABAJO) / FILAS
    c = canvas.Canvas(salida, pagesize=A4)
    c.setTitle("PUMPKIN · 250 pases QR")
    c.setAuthor("ExperienceBT")
    for h in range(hojas):
        ini = h * POR_HOJA + 1
        fin = min(TOTAL, ini + POR_HOJA - 1)
        c.setFont("Helvetica-Bold", 13)
        c.drawCentredString(ancho / 2, alto - 15 * mm, "PUMPKIN · PASES DE ACCESO QR (250 UNIDADES)")
        c.setFont("Helvetica", 8.5)
        c.setFillColorRGB(0.35, 0.4, 0.5)
        c.drawCentredString(
            ancho / 2,
            alto - 21 * mm,
            f"Hoja {h + 1} de {hojas}   |   Rango: {codigo(ini)} a {codigo(fin)}   |   Contenido del QR: QR-[ID]",
        )
        c.setStrokeColorRGB(0.8, 0.83, 0.88)
        c.setLineWidth(0.4)
        for i, n in enumerate(range(ini, fin + 1)):
            fila, col = divmod(i, COLS)
            x = MARGEN_X + col * celda_w
            y = alto - ARRIBA - (fila + 1) * celda_h
            c.setStrokeColorRGB(0.8, 0.83, 0.88)
            c.rect(x, y, celda_w, celda_h, stroke=1, fill=0)
            qx = x + (celda_w - LADO_QR) / 2
            qy = y + 6.2 * mm
            dibujar_qr(c, codigo(n), qx, qy, LADO_QR)
            c.setFillColorRGB(0.07, 0.13, 0.22)
            c.setFont("Helvetica-Bold", 8)
            c.drawCentredString(x + celda_w / 2, y + 2.2 * mm, f"ID: {codigo(n)}")
        c.setFont("Helvetica", 7)
        c.setFillColorRGB(0.45, 0.5, 0.58)
        c.drawCentredString(ancho / 2, 6 * mm, f"Listo para imprimir al 100 % (sin ajustar a página) y recortar · Hoja {h + 1} de {hojas}")
        c.showPage()
    c.save()


if __name__ == "__main__":
    generar(sys.argv[1] if len(sys.argv) > 1 else "PUMPKIN-250-QR.pdf")
