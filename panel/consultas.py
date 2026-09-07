# -*- coding: utf-8 -*-
"""Consultas del panel: métricas, listados de registros y datos de exportación.

El catálogo de abajo describe cada tabla una sola vez; de ahí salen la vista de
tabla, el buscador, el ordenamiento, la ficha de detalle y el Excel. Al ser la
única fuente de nombres de columna, evita SQL armado con texto del usuario:
todo lo que llega de fuera se valida contra este catálogo.
"""
from db import conexion, escalar, filas

# El evento es en Puebla; la BD guarda timestamptz y aquí se convierte una sola
# vez para pantalla y Excel.
ZONA_HORARIA = "America/Mexico_City"

# ==========================================
# CATALOGO DE TABLAS
# ==========================================
# tipo: campo -> (etiqueta, clase, en_tabla)
#   clase: texto | correo | tel | bool | entero | lista | fecha
#
# Las columnas `fecha` salen ya formateadas en hora local de México, así que
# tabla, ficha y Excel las tratan como texto. Ordenar sigue usando el
# timestamp crudo, no la cadena.

CATALOGO = {
    "empresas": {
        "nombre": "Empresas",
        "corto": "Empresas",
        "descripcion": "Contactos de empresas registradas",
        "tabla": "Registro_Empresarios",
        "id": "idEmpresario",
        "acento": "azul",
        "tarjeta": {"titulo": ["Nombre", "ApellidoPaterno", "ApellidoMaterno"],
                    "subtitulo": "Empresa",
                    "meta": ["PosicionEmpresa", "Estado"]},
        "campos": [
            ("idEmpresario", "ID", "entero", True),
            ("Nombre", "Nombre", "texto", True),
            ("ApellidoPaterno", "Apellido paterno", "texto", True),
            ("ApellidoMaterno", "Apellido materno", "texto", False),
            ("Empresa", "Empresa", "texto", True),
            ("PosicionEmpresa", "Posición", "texto", True),
            ("Cargo", "Cargo", "texto", False),
            ("AreaResponsabilidad", "Área", "texto", True),
            ("Correo", "Correo", "correo", True),
            ("LadaPais", "Lada", "texto", False),
            ("Telefono", "Teléfono", "tel", True),
            ("Pais", "País", "texto", False),
            ("Estado", "Estado", "texto", True),
            ("Ciudad", "Ciudad", "texto", True),
            ("CodigoPostal", "C.P.", "texto", False),
            ("CalleNumero", "Calle y número", "texto", False),
            ("SectorIndustria", "Sector / Industria", "lista", False),
            ("NumEmpleados", "Núm. empleados", "texto", False),
            ("DecisionesCompra", "Decisiones de compra", "texto", False),
            ("Presupuesto", "Presupuesto", "texto", False),
            ("TiempoInversion", "Tiempo de inversión", "texto", False),
            ("ProductosInteres", "Áreas de interés", "lista", False),
            ("Edad", "Edad", "texto", True),
            ("AreaInteresGeneral", "Área que quiso explorar", "texto", False),
            ("confirmado", "Confirmado", "bool", True),
            ("asistencias", "Asist.", "entero", True),
            ("FechaRegistro", "Fecha y hora de registro", "fecha", True),
        ],
    },
    "estudiantes": {
        "nombre": "Estudiantes",
        "corto": "Alumnos",
        "descripcion": "Alumnos inscritos por institución",
        "tabla": "Registro_Alumnos",
        "id": "idAlumno",
        "acento": "rosa",
        "tarjeta": {"titulo": ["Nombre", "ApellidoPaterno"],
                    "subtitulo": "InstitucionEducativa",
                    "meta": ["Grado"]},
        "campos": [
            ("idAlumno", "ID", "entero", True),
            ("Nombre", "Nombre", "texto", True),
            ("ApellidoPaterno", "Apellido paterno", "texto", True),
            ("InstitucionEducativa", "Tipo de institución", "texto", True),
            ("Grado", "Carrera", "texto", True),
            ("Edad", "Edad", "texto", True),
            ("Competencia", "Competencia", "texto", True),
            ("AreaInteresGeneral", "Área que quiso explorar", "texto", False),
            ("Correo", "Correo", "lista", True),
            ("Telefono", "Teléfono", "tel", True),
            ("confirmado", "Confirmado", "bool", True),
            ("asistencias", "Asist.", "entero", True),
            ("FechaRegistro", "Fecha y hora de registro", "fecha", True),
        ],
    },
    "elisa": {
        "nombre": "Evento Elisa Carrillo",
        "corto": "Elisa",
        "descripcion": "Registros del evento especial",
        "tabla": "Registro_elisaCarrillo",
        "id": "idUsuario",
        "acento": "teal",
        "tarjeta": {"titulo": ["Nombre"],
                    "subtitulo": "Correo",
                    "meta": ["Telefono"]},
        "campos": [
            ("idUsuario", "ID", "entero", True),
            ("Nombre", "Nombre", "texto", True),
            ("Correo", "Correo", "correo", True),
            ("Telefono", "Teléfono", "tel", True),
            ("CodigoPostal", "C.P.", "texto", True),
            ("confirmado", "Confirmado", "bool", True),
            ("asistencias", "Asist.", "entero", True),
            ("FechaRegistro", "Fecha y hora de registro", "fecha", True),
        ],
    },
}


# ==========================================
# ALCANCES DE ACCESO
# ==========================================
# Qué tablas ve cada tipo de usuario. El promotor no lleva el evento de Elisa
# Carrillo, así que no debe verlo ni en pantalla ni en la exportación.

ALCANCES = {
    "interno": ("empresas", "estudiantes", "elisa"),
    "promotor": ("empresas", "estudiantes"),
}


def tipos_de(alcance: str) -> list:
    """Tablas permitidas para un alcance. Ante un valor desconocido devuelve
    el alcance más restringido, nunca el completo."""
    return list(ALCANCES.get(alcance, ALCANCES["promotor"]))


def permitido(tipo: str, alcance: str) -> bool:
    return tipo in tipos_de(alcance)


def descriptor(tipo: str) -> dict:
    if tipo not in CATALOGO:
        raise KeyError(f"Tipo desconocido: {tipo}")
    return CATALOGO[tipo]


def columnas_publicas(tipo: str) -> list:
    """Metadatos de columnas que consume el frontend."""
    d = descriptor(tipo)
    return [{"clave": c, "etiqueta": e, "clase": k, "en_tabla": t}
            for c, e, k, t in d["campos"]]


def _seleccion(d: dict) -> str:
    """Las columnas ARRAY se aplanan a texto para poder mostrarlas y buscarlas."""
    partes = []
    for clave, _etq, clase, _t in d["campos"]:
        if clase == "lista":
            partes.append(
                f'ARRAY_TO_STRING("{clave}", \', \') AS "{clave}"')
        elif clase == "fecha":
            partes.append(
                f'TO_CHAR("{clave}" AT TIME ZONE \'{ZONA_HORARIA}\', '
                f'\'DD/MM/YYYY HH24:MI\') AS "{clave}"')
        else:
            partes.append(f'"{clave}"')
    return ", ".join(partes)


def _columnas_buscables(d: dict) -> list:
    return [(c, k) for c, _e, k, _t in d["campos"] if k in ("texto", "correo", "tel", "lista")]


# ==========================================
# LISTADO DE REGISTROS
# ==========================================

def listar(tipo, q="", orden=None, dir_="asc", pagina=1, por_pagina=25,
           solo=None):
    """Listado paginado con búsqueda libre y ordenamiento validado."""
    d = descriptor(tipo)
    tabla, id_col = d["tabla"], d["id"]
    claves = [c for c, _e, _k, _t in d["campos"]]

    orden = orden if orden in claves else id_col
    direccion = "DESC" if str(dir_).lower() == "desc" else "ASC"

    condiciones, params = [], {}
    if q:
        piezas = []
        for i, (col, clase) in enumerate(_columnas_buscables(d)):
            campo = (f'ARRAY_TO_STRING("{col}", \' \')' if clase == "lista"
                     else f'CAST("{col}" AS TEXT)')
            piezas.append(f"{campo} ILIKE :q")
        if piezas:
            condiciones.append("(" + " OR ".join(piezas) + ")")
            params["q"] = f"%{q}%"

    if solo == "confirmados":
        condiciones.append('"confirmado" IS TRUE')
    elif solo == "pendientes":
        condiciones.append('"confirmado" IS NOT TRUE')

    donde = ("WHERE " + " AND ".join(condiciones)) if condiciones else ""

    por_pagina = max(5, min(int(por_pagina), 200))
    pagina = max(1, int(pagina))
    pagina_params = dict(params, limite=por_pagina, salto=(pagina - 1) * por_pagina)

    with conexion() as con:
        total = escalar(con, f'SELECT COUNT(*) FROM "{tabla}" {donde}', **params)
        registros = filas(con, f'''
            SELECT {_seleccion(d)}
            FROM "{tabla}"
            {donde}
            ORDER BY "{orden}" {direccion} NULLS LAST, "{id_col}" ASC
            LIMIT :limite OFFSET :salto
        ''', **pagina_params)

    paginas = max(1, -(-total // por_pagina))
    return {
        "tipo": tipo,
        "nombre": d["nombre"],
        "columnas": columnas_publicas(tipo),
        "id": id_col,
        "registros": [dict(r) for r in registros],
        "total": total,
        "pagina": min(pagina, paginas),
        "paginas": paginas,
        "por_pagina": por_pagina,
    }


def obtener(tipo, id_):
    """Ficha completa de un registro."""
    d = descriptor(tipo)
    with conexion() as con:
        fila = filas(con, f'''
            SELECT {_seleccion(d)} FROM "{d["tabla"]}"
            WHERE "{d["id"]}" = :id
        ''', id=id_)
    return dict(fila[0]) if fila else None


def todos_para_exportar(tipo):
    """Todas las filas de un tipo, en el orden del catálogo."""
    d = descriptor(tipo)
    with conexion() as con:
        registros = filas(con, f'''
            SELECT {_seleccion(d)} FROM "{d["tabla"]}" ORDER BY "{d["id"]}"
        ''')
    return [dict(r) for r in registros]


# ==========================================
# METRICAS
# ==========================================

def _norm(col: str) -> str:
    """Normaliza texto libre para agrupar variantes de acentos y mayúsculas."""
    return (
        "UPPER(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(TRANSLATE("
        f"{col}, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNAEIOUUN'"
        "), '[°ºª.,]', ' ', 'g'), '\\s+', ' ', 'g')))"
    )


def _con_porcentaje(registros, limite=None):
    if not registros:
        return []
    tope = max(r["total"] for r in registros) or 1
    salida = [{"etiqueta": r["etiqueta"], "total": r["total"],
               "pct": round(r["total"] * 100 / tope)} for r in registros]
    return salida[:limite] if limite else salida


def _ranking(con, tabla, columna, limite=None):
    """Ranking de un campo de texto libre: agrupa variantes de escritura y
    muestra la grafía más frecuente del grupo."""
    base = f'COALESCE(NULLIF(BTRIM("{columna}"), \'\'), \'Sin especificar\')'
    registros = filas(con, f'''
        SELECT MODE() WITHIN GROUP (ORDER BY crudo) AS etiqueta, COUNT(*) AS total
        FROM (SELECT {base} AS crudo, {_norm(base)} AS clave FROM "{tabla}") s
        GROUP BY clave ORDER BY 2 DESC, 1
    ''')
    return _con_porcentaje(registros, limite)


def _ranking_lista(con, tabla, columna, limite=None):
    """Ranking de una columna ARRAY (se desdobla con unnest)."""
    registros = filas(con, f'''
        SELECT BTRIM(item) AS etiqueta, COUNT(*) AS total
        FROM "{tabla}", unnest("{columna}") AS item
        WHERE "{columna}" IS NOT NULL AND BTRIM(item) <> ''
        GROUP BY 1 ORDER BY 2 DESC, 1
    ''')
    return _con_porcentaje(registros, limite)


def resumen(tipos=None) -> dict:
    """Conteos, tasas y rankings de las tablas indicadas.

    Recibe la lista ya filtrada por el alcance del usuario: lo que no está en
    `tipos` no se consulta ni se suma.
    """
    tipos = list(tipos) if tipos else list(CATALOGO)
    with conexion() as con:
        categorias = []
        for clave in [t for t in CATALOGO if t in tipos]:
            d = CATALOGO[clave]
            t = d["tabla"]
            total = escalar(con, f'SELECT COUNT(*) FROM "{t}"')
            conf = escalar(con, f'SELECT COUNT(*) FROM "{t}" WHERE "confirmado"')
            asis = escalar(con, f'SELECT COALESCE(SUM("asistencias"),0) FROM "{t}"')
            ultimo = escalar(con, f'SELECT COALESCE(MAX("{d["id"]}"),0) FROM "{t}"')
            categorias.append({
                "clave": clave, "nombre": d["nombre"],
                "descripcion": d["descripcion"],
                "acento": d["acento"], "total": total, "confirmados": conf,
                "pendientes": total - conf, "asistencias": asis,
                "pct": round(conf * 100 / total) if total else 0,
                "ultimo_id": ultimo,
            })

        total = sum(c["total"] for c in categorias)
        confirmados = sum(c["confirmados"] for c in categorias)
        asistencias = sum(c["asistencias"] for c in categorias)

        # Cada ranking depende de una tabla: si el usuario no la tiene en su
        # alcance, ni siquiera se consulta.
        rankings = {}
        if "estudiantes" in tipos:
            rankings["instituciones"] = _ranking(
                con, "Registro_Alumnos", "InstitucionEducativa", 10)
            rankings["grados"] = _ranking(con, "Registro_Alumnos", "Grado", 10)
        if "empresas" in tipos:
            rankings["empresas"] = _ranking(con, "Registro_Empresarios", "Empresa", 12)
            rankings["estados"] = _ranking(con, "Registro_Empresarios", "Estado", 8)
            rankings["areas"] = _ranking(
                con, "Registro_Empresarios", "AreaResponsabilidad", 8)
            rankings["posiciones"] = _ranking(
                con, "Registro_Empresarios", "PosicionEmpresa", 8)
            rankings["productos"] = _ranking_lista(
                con, "Registro_Empresarios", "ProductosInteres", 14)
            rankings["sectores"] = _ranking_lista(
                con, "Registro_Empresarios", "SectorIndustria", 8)

        partes = []
        if "empresas" in tipos:
            partes.append('''
                SELECT * FROM (
                    SELECT "idEmpresario" AS id, 'empresas' AS tipo,
                           CONCAT_WS(' ', "Nombre", "ApellidoPaterno") AS nombre,
                           "Empresa" AS detalle, "confirmado"
                    FROM "Registro_Empresarios"
                    ORDER BY "idEmpresario" DESC LIMIT 8
                ) e''')
        if "estudiantes" in tipos:
            partes.append('''
                SELECT * FROM (
                    SELECT "idAlumno" AS id, 'estudiantes' AS tipo,
                           CONCAT_WS(' ', "Nombre", "ApellidoPaterno") AS nombre,
                           "InstitucionEducativa" AS detalle, "confirmado"
                    FROM "Registro_Alumnos"
                    ORDER BY "idAlumno" DESC LIMIT 8
                ) a''')
        recientes = filas(con, " UNION ALL ".join(partes)) if partes else []

    return {
        "total": total,
        "confirmados": confirmados,
        "pendientes": total - confirmados,
        "tasa_confirmacion": round(confirmados * 100 / total) if total else 0,
        "asistencias": asistencias,
        "categorias": categorias,
        "rankings": rankings,
        "recientes": [dict(r) for r in recientes],
        # Cambia en cuanto entra un registro nuevo o se confirma uno: el
        # frontend la usa para saber si debe animar.
        "firma": "|".join(f'{c["clave"]}:{c["total"]}:{c["confirmados"]}:'
                          f'{c["asistencias"]}:{c["ultimo_id"]}'
                          for c in categorias),
    }
