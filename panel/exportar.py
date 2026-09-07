# -*- coding: utf-8 -*-
"""Exportación a Excel (.xlsx) con el formato de marca del evento.

Libro completo de openpyxl: portada con logos, resumen con gráficas nativas,
hoja de análisis, y una hoja por tabla como Tabla de Excel con formato
condicional, hipervínculos y configuración de impresión.
"""
import io
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.chart import BarChart, DoughnutChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.marker import DataPoint
from openpyxl.drawing.image import Image as ImagenXL
from openpyxl.worksheet.pagebreak import Break
from openpyxl.formatting.rule import CellIsRule, DataBarRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

import consultas

TZ = ZoneInfo("America/Mexico_City")
IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "img")

# Paleta de _tokens.scss en ARGB.
NAVY = "FF071A3A"
NAVY_MID = "FF0F2D5C"
TEAL = "FF12B5B0"
TEAL_DEEP = "FF0D8F8B"
ROSA = "FFD81B70"
AZUL = "FF1A4FB8"
GRIS = "FFF5F7FB"
GRIS_2 = "FFE8EEF6"
BORDE = "FFD5DEEA"
TEXTO = "FF132039"
MUTED = "FF5B6B82"
VERDE = "FF1B7A45"
VERDE_BG = "FFE6F4EC"
ROJO = "FFC62828"
ROJO_BG = "FFFDEAEA"
BLANCO = "FFFFFFFF"

ACENTOS = {"azul": AZUL, "rosa": ROSA, "teal": TEAL_DEEP}
FUENTE = "Calibri"

_lado = Side(style="thin", color=BORDE)
BORDE_FINO = Border(left=_lado, right=_lado, top=_lado, bottom=_lado)


def _fuente(size=10, bold=False, color=TEXTO, italic=False):
    return Font(name=FUENTE, size=size, bold=bold, color=color, italic=italic)


def _relleno(color):
    return PatternFill("solid", fgColor=color)


def _etiquetas(valor=True, porcentaje=False):
    """Etiquetas de datos limpias.

    Excel muestra serie y categoría si no se apagan explícitamente, lo que
    llena la gráfica de texto repetido ("Confirmados, Empresas, 17").
    """
    e = DataLabelList()
    e.showVal = valor
    e.showPercent = porcentaje
    e.showSerName = False
    e.showCatName = False
    e.showLegendKey = False
    e.showBubbleSize = False
    return e


def _imprimir(ws, cols, fila_enc=None, horizontal=True):
    """Deja la hoja lista para imprimir o mandar en PDF."""
    ws.page_setup.orientation = "landscape" if horizontal else "portrait"
    if cols <= 12:
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.sheet_properties.pageSetUpPr.fitToPage = True
    else:
        # Con muchas columnas, forzar una sola página de ancho deja la letra
        # ilegible: mejor repartir a lo ancho repitiendo el encabezado.
        ws.page_setup.scale = 60
        ws.sheet_properties.pageSetUpPr.fitToPage = False
    ws.print_options.horizontalCentered = True
    if fila_enc:
        ws.print_title_rows = f"{fila_enc}:{fila_enc}"
    ws.oddFooter.left.text = "Registros del evento"
    ws.oddFooter.right.text = "Página &P de &N"
    ws.oddFooter.left.size = ws.oddFooter.right.size = 8
    ws.oddFooter.left.color = ws.oddFooter.right.color = "5B6B82"


def _banda(ws, fila, texto, subtitulo, ancho, color):
    """Franja de título al estilo de la cabecera del sitio."""
    ancho = max(ancho, 3)
    ws.merge_cells(start_row=fila, start_column=1, end_row=fila, end_column=ancho)
    c = ws.cell(row=fila, column=1, value=texto)
    c.font = _fuente(15, True, BLANCO)
    c.fill = _relleno(color)
    c.alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[fila].height = 30

    ws.merge_cells(start_row=fila + 1, start_column=1, end_row=fila + 1, end_column=ancho)
    s = ws.cell(row=fila + 1, column=1, value=subtitulo)
    s.font = _fuente(9, color=MUTED)
    s.fill = _relleno(GRIS)
    s.alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[fila + 1].height = 18


def _valor_plano(valor, clase):
    if valor is None or valor == "":
        return 0 if clase == "entero" else ""
    if clase == "bool":
        return "Sí" if valor else "No"
    return valor


# ==========================================
# PORTADA
# ==========================================

def _hoja_portada(wb, d, generado, tipos=None, alcance=None):
    ws = wb.create_sheet("Portada")
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = NAVY

    for col, ancho in zip("ABCDEFGH", (3, 24, 20, 20, 20, 20, 20, 3)):
        ws.column_dimensions[col].width = ancho

    # Cintillo superior de marca.
    for col in range(1, 9):
        c = ws.cell(row=1, column=col)
        c.fill = _relleno(TEAL if col <= 3 else (AZUL if col <= 5 else ROSA))
    ws.row_dimensions[1].height = 6

    # Fondo navy del bloque de título.
    for fila in range(2, 12):
        for col in range(1, 9):
            ws.cell(row=fila, column=col).fill = _relleno(NAVY)

    # Los logos siguen la misma disposición que el sitio y se muestran con el
    # mismo peso: ninguna marca por encima de otra.
    try:
        for archivo, alto, ancla in (("ficti-logo.png", 58, "B3"),
                                     ("tech-capital-logo.png", 38, "E3")):
            img = ImagenXL(os.path.join(IMG, archivo))
            img.height, img.width = alto, int(alto * img.width / img.height)
            ws.add_image(img, ancla)
    except Exception:
        # Sin Pillow o sin archivos: la portada sigue siendo válida.
        pass

    ws.merge_cells("B8:G8")
    t = ws.cell(row=8, column=2, value="Registros del evento")
    t.font = _fuente(24, True, BLANCO)
    t.alignment = Alignment(vertical="center")
    ws.row_dimensions[8].height = 34

    ws.merge_cells("B9:G9")
    s = ws.cell(row=9, column=2,
                value="Panel de control · panel.experiencebt.com.mx")
    s.font = _fuente(11, color="FFB7C4D8")

    ws.merge_cells("B10:G10")
    f = ws.cell(row=10, column=2, value=f"Generado el {generado}")
    f.font = _fuente(10, color="FF8FA3BC")

    # Tarjetas de indicadores. Se arman desde las categorías presentes, que
    # dependen del alcance del usuario.
    por_clave = {c["clave"]: c for c in d["categorias"]}
    tarjetas = [("TOTAL DE REGISTROS", d["total"], TEAL_DEEP)]
    for clave, etiqueta, color in (("empresas", "EMPRESAS", AZUL),
                                   ("estudiantes", "ESTUDIANTES", ROSA),
                                   ("elisa", "EVENTO ELISA", TEAL_DEEP)):
        if clave in por_clave and len(tarjetas) < 3:
            tarjetas.append((etiqueta, por_clave[clave]["total"], color))
    tarjetas.append(("CONFIRMACIÓN", f'{d["tasa_confirmacion"]}%', NAVY_MID))
    fila = 13
    for i, (etq, val, color) in enumerate(tarjetas):
        col = 2 + i * 2 if i < 2 else 2 + (i - 2) * 2
        f_base = fila if i < 2 else fila + 4
        ws.merge_cells(start_row=f_base, start_column=col,
                       end_row=f_base, end_column=col + 1)
        e = ws.cell(row=f_base, column=col, value=etq)
        e.font = _fuente(9, True, BLANCO)
        e.fill = _relleno(color)
        e.alignment = Alignment(horizontal="center", vertical="center")

        ws.merge_cells(start_row=f_base + 1, start_column=col,
                       end_row=f_base + 2, end_column=col + 1)
        v = ws.cell(row=f_base + 1, column=col, value=val)
        v.font = _fuente(30, True, color)
        v.fill = _relleno(GRIS)
        v.alignment = Alignment(horizontal="center", vertical="center")
        v.border = BORDE_FINO
        ws.row_dimensions[f_base + 1].height = 34

    # Deja constancia de qué vista generó el libro: fuera del panel es la
    # única forma de saber si trae todas las tablas o solo algunas.
    incluidas = ", ".join(consultas.CATALOGO[t]["nombre"]
                          for t in (tipos or consultas.CATALOGO))
    ws.merge_cells("B21:G21")
    a = ws.cell(row=21, column=2,
                value=f"Vista: {(alcance or 'completa').upper()}  ·  Incluye: {incluidas}")
    a.font = _fuente(10, True, NAVY_MID)
    a.fill = _relleno(GRIS_2)
    a.alignment = Alignment(vertical="center", indent=1)
    ws.row_dimensions[21].height = 22

    ws.merge_cells("B22:G22")
    n = ws.cell(row=22, column=2, value=(
        "Este libro contiene el detalle de los registros capturados en las "
        "tablas indicadas arriba, con todos los campos del formulario."))
    n.font = _fuente(9, color=MUTED)
    n.alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[22].height = 28

    # Tercer logo al pie, como en el sitio.
    try:
        pie = ImagenXL(os.path.join(IMG, "gabor-logo-footer.png"))
        pie.height, pie.width = 34, int(34 * pie.width / pie.height)
        ws.add_image(pie, "B24")
    except Exception:
        pass

    _imprimir(ws, 8)
    return ws


# ==========================================
# RESUMEN CON GRAFICAS
# ==========================================

def _hoja_resumen(wb, d, generado):
    ws = wb.create_sheet("Resumen")
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = TEAL_DEEP

    # Las columnas G–J no llevan datos: dan ancho para que la dona quepa
    # completa dentro del área de impresión.
    for col, ancho in zip("ABCDEFGHIJ", (28, 15, 15, 15, 15, 15, 12, 12, 12, 12)):
        ws.column_dimensions[col].width = ancho

    _banda(ws, 1, "Resumen del evento",
           f"Conteo por categoría y estado de confirmación · {generado}", 6, NAVY_MID)

    # --- indicadores generales
    fila = 4
    ws.cell(row=fila, column=1, value="Indicadores generales").font = _fuente(11, True, NAVY_MID)
    fila += 1
    for etq, val in (("Total de registros", d["total"]),
                     ("Confirmados", d["confirmados"]),
                     ("Pendientes", d["pendientes"]),
                     ("Tasa de confirmación", d["tasa_confirmacion"] / 100),
                     ("Asistencias escaneadas", d["asistencias"])):
        a = ws.cell(row=fila, column=1, value=etq)
        a.font = _fuente(10)
        a.fill = _relleno(GRIS)
        a.border = BORDE_FINO
        b = ws.cell(row=fila, column=2, value=val)
        b.font = _fuente(11, True, NAVY_MID)
        b.border = BORDE_FINO
        b.alignment = Alignment(horizontal="center")
        if etq.startswith("Tasa"):
            b.number_format = "0%"
        fila += 1

    # --- tabla por categoría (fuente de las gráficas)
    fila_cat = fila + 2
    ws.cell(row=fila_cat - 1, column=1,
            value="Desglose por categoría").font = _fuente(11, True, NAVY_MID)
    encabezados = ["Categoría", "Registros", "Confirmados", "Pendientes",
                   "Asistencias", "% confirmado"]
    for i, etq in enumerate(encabezados, start=1):
        c = ws.cell(row=fila_cat, column=i, value=etq)
        c.font = _fuente(10, True, BLANCO)
        c.fill = _relleno(NAVY)
        c.border = BORDE_FINO
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[fila_cat].height = 26

    for j, cat in enumerate(d["categorias"], start=1):
        valores = [cat["nombre"], cat["total"], cat["confirmados"],
                   cat["pendientes"], cat["asistencias"],
                   (cat["pct"] / 100) if cat["total"] else 0]
        for i, v in enumerate(valores, start=1):
            c = ws.cell(row=fila_cat + j, column=i, value=v)
            c.font = _fuente(10)
            c.border = BORDE_FINO
            if i > 1:
                c.alignment = Alignment(horizontal="center")
            if i == 6:
                c.number_format = "0%"
        if j % 2 == 0:
            for i in range(1, 7):
                ws.cell(row=fila_cat + j, column=i).fill = _relleno(GRIS)

    ultima_cat = fila_cat + len(d["categorias"])

    # Las gráficas van en su propia página impresa: en pantalla la hoja sigue
    # siendo continua, pero al imprimir ninguna queda cortada.
    ws.row_breaks.append(Break(id=ultima_cat + 1))

    # --- gráfica de barras: confirmados vs pendientes
    barras = BarChart()
    barras.type = "col"
    barras.grouping = "stacked"
    barras.overlap = 100
    barras.title = "Confirmados y pendientes por categoría"
    barras.height, barras.width = 9.5, 14
    datos = Reference(ws, min_col=3, max_col=4, min_row=fila_cat, max_row=ultima_cat)
    etiquetas = Reference(ws, min_col=1, min_row=fila_cat + 1, max_row=ultima_cat)
    barras.add_data(datos, titles_from_data=True)
    barras.set_categories(etiquetas)
    barras.dataLabels = _etiquetas(valor=True)
    if len(barras.series) >= 2:
        barras.series[0].graphicalProperties.solidFill = TEAL_DEEP[2:]
        barras.series[1].graphicalProperties.solidFill = "E8A0B8"
    barras.y_axis.title = "Registros"
    # openpyxl deja los ejes ocultos por omisión; sin esto no salen las
    # etiquetas de categoría bajo las barras.
    barras.x_axis.delete = False
    barras.y_axis.delete = False
    # A la derecha: abajo se encimaría con las etiquetas del eje de categorías.
    barras.legend.position = "r"
    ws.add_chart(barras, "A" + str(ultima_cat + 3))

    # --- dona: proporción de registros por categoría
    dona = DoughnutChart(holeSize=55)
    dona.title = "Distribución de registros"
    dona.height, dona.width = 9.5, 10.5
    dona.add_data(Reference(ws, min_col=2, min_row=fila_cat, max_row=ultima_cat),
                  titles_from_data=True)
    dona.set_categories(etiquetas)
    dona.dataLabels = _etiquetas(valor=False, porcentaje=True)
    dona.legend.position = "b"
    # Cada porción con el color de su categoría, no la paleta por defecto.
    if dona.series:
        for i, cat in enumerate(d["categorias"]):
            punto = DataPoint(idx=i)
            punto.graphicalProperties.solidFill = ACENTOS.get(cat["acento"], NAVY_MID)[2:]
            dona.series[0].data_points.append(punto)
    ws.add_chart(dona, "E" + str(ultima_cat + 3))

    # Las gráficas viven debajo del rango con datos; sin área explícita Excel
    # recortaría la impresión a la última celda escrita.
    ws.print_area = f"A1:J{ultima_cat + 27}"

    _imprimir(ws, 10)
    return ws


# ==========================================
# ANALISIS
# ==========================================

def _bloque_ranking(ws, fila, titulo, items, color, con_grafica=True):
    """Escribe un ranking y, si se pide, su gráfica de barras horizontal."""
    ws.cell(row=fila, column=1, value=titulo).font = _fuente(11, True, NAVY_MID)
    fila += 1
    for i, etq in enumerate(("Concepto", "Registros"), start=1):
        c = ws.cell(row=fila, column=i, value=etq)
        c.font = _fuente(10, True, BLANCO)
        c.fill = _relleno(color)
        c.border = BORDE_FINO
    encabezado = fila

    if not items:
        ws.cell(row=fila + 1, column=1,
                value="Sin datos capturados todavía.").font = _fuente(10, italic=True, color=MUTED)
        return fila + 3

    for j, it in enumerate(items, start=1):
        a = ws.cell(row=fila + j, column=1, value=it["etiqueta"])
        a.font = _fuente(10)
        a.border = BORDE_FINO
        a.alignment = Alignment(wrap_text=True, vertical="center")
        b = ws.cell(row=fila + j, column=2, value=it["total"])
        b.font = _fuente(10, True)
        b.border = BORDE_FINO
        b.alignment = Alignment(horizontal="center")
        if j % 2 == 0:
            a.fill = _relleno(GRIS)
            b.fill = _relleno(GRIS)

    ultima = fila + len(items)
    ws.conditional_formatting.add(
        f"B{fila + 1}:B{ultima}",
        DataBarRule(start_type="num", start_value=0, end_type="max",
                    color=color[2:], showValue=True))

    if con_grafica:
        g = BarChart()
        g.type = "bar"
        g.title = titulo
        # Altura acotada para que el bloque y su gráfica quepan en una página.
        g.height = min(11.5, max(5.5, 0.5 * len(items) + 2.0))
        g.width = 12
        g.add_data(Reference(ws, min_col=2, min_row=encabezado, max_row=ultima),
                   titles_from_data=True)
        g.set_categories(Reference(ws, min_col=1, min_row=encabezado + 1, max_row=ultima))
        g.legend = None
        g.dataLabels = _etiquetas(valor=True)
        g.y_axis.majorGridlines = None
        g.x_axis.delete = False
        g.y_axis.delete = False
        if g.series:
            g.series[0].graphicalProperties.solidFill = color[2:]
        ws.add_chart(g, f"D{encabezado}")

    # Cada ranking arranca en página nueva: así ninguna gráfica queda partida.
    siguiente = ultima + 24
    ws.row_breaks.append(Break(id=siguiente - 2))
    return siguiente


def _hoja_analisis(wb, d, generado):
    ws = wb.create_sheet("Análisis")
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = AZUL

    ws.column_dimensions["A"].width = 46
    ws.column_dimensions["B"].width = 13
    ws.column_dimensions["C"].width = 3

    _banda(ws, 1, "Análisis de registros",
           f"Rankings agrupando variantes de escritura · {generado}", 12, AZUL)

    # Solo los rankings presentes: `resumen()` omite los de tablas fuera del
    # alcance, así que aquí no se puede dar por hecho que existan todos.
    r = d["rankings"]
    fila = 4
    escritos = 0
    for titulo, clave, color in (
        ("Productos de interés", "productos", TEAL_DEEP),
        ("Instituciones educativas", "instituciones", ROSA),
        ("Carrera", "grados", ROSA),
        ("Empresas registradas", "empresas", AZUL),
        ("Estado de procedencia", "estados", AZUL),
        ("Área de responsabilidad", "areas", AZUL),
        ("Posición en la empresa", "posiciones", AZUL),
        ("Sector / Industria", "sectores", AZUL),
    ):
        if clave not in r:
            continue
        fila = _bloque_ranking(ws, fila, titulo, r[clave], color)
        escritos += 1

    if not escritos:
        ws.cell(row=4, column=1, value=(
            "No hay rankings disponibles para las tablas incluidas en esta "
            "exportación.")).font = _fuente(10, italic=True, color=MUTED)

    ws.print_area = f"A1:L{fila + 4}"
    _imprimir(ws, 12)
    return ws


# ==========================================
# HOJAS DE REGISTROS
# ==========================================

def _hoja_registros(wb, tipo):
    d = consultas.descriptor(tipo)
    campos = d["campos"]
    registros = consultas.todos_para_exportar(tipo)
    color = ACENTOS.get(d["acento"], NAVY_MID)
    nombre = d["nombre"][:31]

    ws = wb.create_sheet(nombre)
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = color

    _banda(ws, 1, d["nombre"],
           f'{len(registros)} registros · todos los campos del formulario',
           len(campos), color)

    enc = 4
    for i, (_clave, etiqueta, _clase, _t) in enumerate(campos, start=1):
        c = ws.cell(row=enc, column=i, value=etiqueta)
        c.font = _fuente(10, True, BLANCO)
        c.fill = _relleno(NAVY)
        c.alignment = Alignment(vertical="center", horizontal="left", wrap_text=True)
        c.border = BORDE_FINO
    ws.row_dimensions[enc].height = 30

    col_confirmado = col_asistencias = None
    for r, reg in enumerate(registros, start=enc + 1):
        for i, (clave, _e, clase, _t) in enumerate(campos, start=1):
            valor = _valor_plano(reg.get(clave), clase)
            c = ws.cell(row=r, column=i, value=valor)
            c.font = _fuente(10)
            c.border = BORDE_FINO
            c.alignment = Alignment(
                vertical="top",
                horizontal="center" if clase in ("entero", "bool") else "left",
                wrap_text=clase == "lista")

            if clase == "correo" and valor:
                c.hyperlink = f"mailto:{valor}"
                c.font = _fuente(10, color=AZUL)
            elif clase == "tel" and valor:
                c.hyperlink = f"tel:{str(valor).replace(' ', '')}"
                c.font = _fuente(10, color=AZUL)

            if clase == "bool":
                col_confirmado = i
            if clave == "asistencias":
                col_asistencias = i

    ultima = enc + len(registros)

    # Tabla de Excel: filtro, bandas y estilo nativos.
    if registros:
        ref = f"A{enc}:{get_column_letter(len(campos))}{ultima}"
        tabla = Table(displayName=f"tbl_{tipo}", ref=ref)
        tabla.tableStyleInfo = TableStyleInfo(
            name="TableStyleMedium2", showRowStripes=True, showColumnStripes=False)
        ws.add_table(tabla)

        if col_confirmado:
            letra = get_column_letter(col_confirmado)
            rango = f"{letra}{enc + 1}:{letra}{ultima}"
            ws.conditional_formatting.add(rango, CellIsRule(
                operator="equal", formula=['"Sí"'],
                fill=_relleno(VERDE_BG), font=Font(name=FUENTE, size=10, bold=True, color=VERDE)))
            ws.conditional_formatting.add(rango, CellIsRule(
                operator="equal", formula=['"No"'],
                fill=_relleno(ROJO_BG), font=Font(name=FUENTE, size=10, bold=True, color=ROJO)))

        if col_asistencias:
            letra = get_column_letter(col_asistencias)
            ws.conditional_formatting.add(
                f"{letra}{enc + 1}:{letra}{ultima}",
                DataBarRule(start_type="num", start_value=0, end_type="max",
                            color=TEAL[2:], showValue=True))
    else:
        ws.cell(row=enc + 1, column=1,
                value="Sin registros en esta tabla.").font = _fuente(10, italic=True, color=MUTED)

    # Anchos a partir del contenido real, con tope para listas largas.
    for i, (clave, etiqueta, clase, _t) in enumerate(campos, start=1):
        largos = [len(str(_valor_plano(reg.get(clave), clase))) for reg in registros]
        ancho = max([len(etiqueta)] + largos) + 4
        ws.column_dimensions[get_column_letter(i)].width = min(max(ancho, 10), 44)

    ws.freeze_panes = ws.cell(row=enc + 1, column=2)
    _imprimir(ws, len(campos), fila_enc=enc)
    return len(registros)


# ==========================================
# CONSTRUCCION
# ==========================================

def construir(tipos=None, alcance=None) -> tuple[bytes, str]:
    """Arma el libro y lo devuelve como bytes junto con el nombre de archivo.

    `tipos` ya viene acotado al alcance del usuario: el resumen y la portada se
    calculan solo sobre esas tablas, así que los totales cuadran con las hojas.
    El alcance se estampa en el nombre del archivo y en la portada para que,
    fuera del panel, se sepa de qué vista salió el libro.
    """
    tipos = list(tipos) if tipos else list(consultas.CATALOGO)
    ahora = datetime.now(TZ)
    generado = ahora.strftime("%d/%m/%Y %H:%M")

    datos = consultas.resumen(tipos)

    wb = Workbook()
    wb.remove(wb.active)

    _hoja_portada(wb, datos, generado, tipos, alcance)
    _hoja_resumen(wb, datos, generado)
    _hoja_analisis(wb, datos, generado)
    for tipo in tipos:
        _hoja_registros(wb, tipo)

    wb.properties.title = "Registros del evento"
    wb.properties.subject = "Registros del evento"
    wb.properties.creator = "Panel de control · panel.experiencebt.com.mx"
    wb.properties.description = (
        f"{datos['total']} registros · {datos['confirmados']} confirmados · "
        f"vista {alcance or 'completa'} · generado el {generado}")
    wb.active = 0

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    etiqueta = "completo" if len(tipos) > 1 else tipos[0]
    sello = f"{alcance}_" if alcance else ""
    return buffer.read(), f"registros_{sello}{etiqueta}_{ahora:%Y-%m-%d_%H%M}.xlsx"
