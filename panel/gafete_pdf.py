# -*- coding: utf-8 -*-
"""Gafete QL-800 — cinta continua 62 mm × ~100 mm (DK continuous).

Nombre + QR sobre placa clara (zona de silencio). Una etiqueta por corte.
"""
from __future__ import annotations

import base64
import io
import os
from typing import Any

import qrcode
from PIL import Image
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

# Brother QL-800 cinta continua 62 mm — largo de corte ~100 mm
ANCHO = 62 * mm
ALTO = 100 * mm

# Tech Capital 2026
FONDO = (0.020, 0.043, 0.110)  # #050b1c
PANEL = (0.039, 0.078, 0.157)  # #0a1428
BORDE = (0.106, 0.169, 0.302)  # #1b2b4d
TEXTO = (1.0, 1.0, 1.0)
TENUE = (0.576, 0.651, 0.769)  # #93a6c4
ROSA = (0.925, 0.118, 0.388)  # #ec1e63 empresas / elisa
VERDE = (0.208, 0.851, 0.361)  # #35d95c estudiantes
TEAL = (0.071, 0.710, 0.690)  # #12b5b0 acento ops

_HERE = os.path.dirname(os.path.abspath(__file__))
_IMG = os.path.join(_HERE, "static", "img")
_BACKEND_ASSETS = os.path.join(_HERE, "..", "backend", "assets")
_logo_cache: dict[tuple[str, int], bytes] = {}


def _asset(*names: str) -> str | None:
    for base in (_IMG, _BACKEND_ASSETS):
        for name in names:
            path = os.path.join(base, name)
            if os.path.isfile(path):
                return path
    return None


def _logo_reader(path: str, alto_px: int) -> ImageReader:
    clave = (path, alto_px)
    if clave not in _logo_cache:
        with Image.open(path) as im:
            im = im.convert("RGBA")
            if im.height > alto_px:
                w = max(1, round(im.width * alto_px / float(im.height)))
                im = im.resize((w, alto_px), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="PNG", optimize=True)
            _logo_cache[clave] = buf.getvalue()
    return ImageReader(io.BytesIO(_logo_cache[clave]))


def _acento(tipo: str) -> tuple[float, float, float]:
    t = (tipo or "").upper()
    if "ESTUDI" in t or "ALUMN" in t:
        return VERDE
    if "ELISA" in t:
        return ROSA
    if "EMPRES" in t:
        return ROSA
    return TEAL


def _partir(texto: str, fuente: str, tam: float, ancho: float, medir) -> list[str]:
    palabras = (texto or "").split()
    if not palabras:
        return ["—"]
    lineas: list[str] = []
    actual = ""
    for p in palabras:
        prueba = f"{actual} {p}".strip()
        if actual and medir(prueba, fuente, tam) > ancho:
            lineas.append(actual)
            actual = p
        else:
            actual = prueba
    if actual:
        lineas.append(actual)
    return lineas


def _qr_png(folio: str, box: int = 10) -> io.BytesIO:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box,
        border=2,
    )
    qr.add_data(folio)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    buf.seek(0)
    return buf


def _marcas_corte(c: canvas.Canvas) -> None:
    """Cruces de corte en las 4 esquinas (fuera del área útil)."""
    c.setStrokeColorRGB(0.55, 0.55, 0.55)
    c.setLineWidth(0.6)
    m = 8
    L = 10
    for x, y, dx, dy in (
        (0, ALTO, 1, -1),
        (ANCHO, ALTO, -1, -1),
        (0, 0, 1, 1),
        (ANCHO, 0, -1, 1),
    ):
        c.line(x + dx * m, y + dy * (m + L), x + dx * m, y + dy * m)
        c.line(x + dx * m, y + dy * m, x + dx * (m + L), y + dy * m)


def payload(
    nombre: str,
    folio: str,
    tipo: str,
    subtitulo: str = "",
) -> dict[str, Any]:
    """Datos + QR en base64 para la cara React (preview / @media print)."""
    qr_buf = _qr_png(folio, box=8)
    b64 = base64.b64encode(qr_buf.getvalue()).decode("ascii")
    return {
        "nombre": (nombre or "—").strip(),
        "folio": folio,
        "tipo": (tipo or "Acreditación").strip(),
        "subtitulo": (subtitulo or "").strip(),
        "evento": "FICTI · Tech Capital 2026",
        "formato": "62×100 mm (cinta continua)",
        "qrDataUrl": f"data:image/png;base64,{b64}",
        "acento": (
            "#35d95c"
            if "ESTUDI" in (tipo or "").upper() or "ALUMN" in (tipo or "").upper()
            else "#ec1e63"
            if any(k in (tipo or "").upper() for k in ("EMPRES", "ELISA"))
            else "#12b5b0"
        ),
    }


def construir(nombre: str, folio: str, tipo: str, subtitulo: str = "") -> bytes:
    buf = io.BytesIO()
    accent = _acento(tipo)
    qr_buf = _qr_png(folio, box=12)

    c = canvas.Canvas(buf, pagesize=(ANCHO, ALTO))
    c.setTitle(f"Gafete — {nombre}")
    c.setAuthor("FICTI · Tech Capital")
    c.setSubject(folio)

    # Fondo a sangre
    c.setFillColorRGB(*FONDO)
    c.rect(0, 0, ANCHO, ALTO, fill=1, stroke=0)

    # Marco de acento
    margen = 6
    c.setStrokeColorRGB(*accent)
    c.setLineWidth(2.2)
    c.roundRect(margen, margen, ANCHO - 2 * margen, ALTO - 2 * margen, 6, fill=0, stroke=1)

    # Banda superior
    banda_h = 22
    c.setFillColorRGB(*PANEL)
    c.roundRect(margen + 2, ALTO - margen - banda_h - 2, ANCHO - 2 * margen - 4, banda_h, 4, fill=1, stroke=0)

    # Logos
    logo_y = ALTO - margen - 16
    logo_h = 11
    gap = 5
    drawn: list[tuple[str, float]] = []
    for path in (
        _asset("ficti-logo.png", "ficti-logo-blanco.png"),
        _asset("tech-capital-logo.png"),
    ):
        if not path:
            continue
        with Image.open(path) as im:
            bw, bh = im.size
        aspect = bw / float(bh) if bh else 1.0
        drawn.append((path, logo_h * aspect))

    if drawn:
        total_w = sum(w for _, w in drawn) + gap * (len(drawn) - 1)
        x = (ANCHO - total_w) / 2
        for path, w in drawn:
            c.drawImage(
                _logo_reader(path, int(logo_h * 4)),
                x,
                logo_y,
                width=w,
                height=logo_h,
                mask="auto",
                preserveAspectRatio=True,
            )
            x += w + gap
    else:
        c.setFillColorRGB(*TEXTO)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(ANCHO / 2, logo_y + 2, "FICTI  ·  TECH CAPITAL")

    # Etiqueta de tipo
    y = ALTO - margen - banda_h - 12
    c.setFillColorRGB(*accent)
    c.setFont("Helvetica-Bold", 7)
    etiqueta = (tipo or "ACREDITACIÓN").upper()
    c.drawCentredString(ANCHO / 2, y, etiqueta)

    # Filete
    y -= 6
    c.setStrokeColorRGB(*BORDE)
    c.setLineWidth(0.5)
    c.line(14, y, ANCHO - 14, y)

    # Nombre (jerarquía principal)
    y -= 14
    nombre_txt = (nombre or "—").strip().upper()
    ancho_util = ANCHO - 18
    tam = 11
    while tam > 7 and c.stringWidth(nombre_txt, "Helvetica-Bold", tam) > ancho_util:
        tam -= 0.5
    lineas = _partir(nombre_txt, "Helvetica-Bold", tam, ancho_util, c.stringWidth)
    if len(lineas) > 2:
        lineas = lineas[:1] + [lineas[1][: max(1, len(lineas[1]) - 1)] + "…"]
    if len(lineas) == 1:
        c.setFillColorRGB(*TEXTO)
        c.setFont("Helvetica-Bold", tam)
        c.drawCentredString(ANCHO / 2, y, lineas[0])
        y -= tam + 3
    else:
        tam = min(tam, 9)
        lineas = _partir(nombre_txt, "Helvetica-Bold", tam, ancho_util, c.stringWidth)[:2]
        c.setFillColorRGB(*TEXTO)
        c.setFont("Helvetica-Bold", tam)
        for ln in lineas:
            c.drawCentredString(ANCHO / 2, y, ln)
            y -= tam + 2

    if subtitulo:
        c.setFillColorRGB(*TENUE)
        c.setFont("Helvetica", 6.5)
        sub = subtitulo.strip().upper()
        for ln in _partir(sub, "Helvetica", 6.5, ancho_util, c.stringWidth)[:2]:
            c.drawCentredString(ANCHO / 2, y, ln)
            y -= 8

    # Evento
    c.setFillColorRGB(*TENUE)
    c.setFont("Helvetica", 5.5)
    c.drawCentredString(ANCHO / 2, y - 1, "FICTI · TECH CAPITAL 2026")

    # QR sobre placa blanca (obligatorio sobre fondo oscuro)
    qr_lado = 36 * mm
    pad = 4
    placa = qr_lado + pad * 2
    placa_x = (ANCHO - placa) / 2
    placa_y = 20

    c.setFillColorRGB(1, 1, 1)
    c.roundRect(placa_x, placa_y, placa, placa, 4, fill=1, stroke=0)
    c.setStrokeColorRGB(*BORDE)
    c.setLineWidth(0.5)
    c.roundRect(placa_x, placa_y, placa, placa, 4, fill=0, stroke=1)

    c.drawImage(
        ImageReader(qr_buf),
        placa_x + pad,
        placa_y + pad,
        qr_lado,
        qr_lado,
        mask="auto",
    )

    # Pie: folio
    c.setFillColorRGB(*TENUE)
    c.setFont("Helvetica", 5)
    c.drawCentredString(ANCHO / 2, 13, "PRESENTA ESTE CÓDIGO EN PUERTA")
    c.setFillColorRGB(*TEXTO)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(ANCHO / 2, 6, folio)

    _marcas_corte(c)
    c.showPage()
    c.save()
    return buf.getvalue()
