# -*- coding: utf-8 -*-
"""APIs de control de accesos FICTI — las consume el SPA React en /accesos."""
from datetime import datetime
from io import BytesIO, StringIO
import csv
import re

from flask import Blueprint, Response, jsonify, request, session
from openpyxl import Workbook
from sqlalchemy import text

import consultas
import gafete_pdf
from db import conexion, escalar, filas
from seguridad import origen_confiable, rate_limit

bp = Blueprint("accesos", __name__, url_prefix="/api/accesos")


@bp.before_request
def _proteger_accesos():
    """AuthN obligatoria: sin sesión no hay datos (antes caía a alcance promotor)."""
    if not session.get("usuario"):
        return jsonify(ok=False, error="sesion_expirada"), 401
    if not origen_confiable():
        return jsonify(ok=False, error="csrf_origen"), 403
    return None


TIPOS = {
    "empresas": {
        "tabla": "Registro_Empresarios",
        "id": "idEmpresario",
        "qr": "EMPRESARIO",
        "etiqueta": "Empresario",
        "extra": "Empresa",
    },
    "estudiantes": {
        "tabla": "Registro_Alumnos",
        "id": "idAlumno",
        "qr": "ALUMNO",
        "etiqueta": "Alumno",
        "extra": "InstitucionEducativa",
    },
    "elisa": {
        "tabla": "Registro_elisaCarrillo",
        "id": "idUsuario",
        "qr": "ELISA_CARRILLO",
        "etiqueta": "Elisa Carrillo",
        "extra": None,
    },
}
QR_A_TIPO = {v["qr"]: k for k, v in TIPOS.items()}
ZONA_DEFECTO = "acreditacion"


def _alcance() -> str:
    return session.get("alcance", "promotor")


def _tipos_ok() -> list[str]:
    return [t for t in consultas.tipos_de(_alcance()) if t in TIPOS]


def _ops() -> bool:
    return _alcance() == "interno"


def _sesion_json():
    return {
        "usuario": session.get("usuario"),
        "nombre": session.get("nombre"),
        "alcance": _alcance(),
        "puedeOperar": _ops(),
        "puedeImprimir": _ops(),
    }


def _forbid_ops():
    return jsonify(ok=False, error="solo_interno"), 403


@bp.get("/sesion")
@rate_limit("api")
def sesion():
    return jsonify(_sesion_json())


@bp.get("/resumen")
@rate_limit("api")
def resumen():
    tipos = _tipos_ok()
    with conexion() as con:
        confirmados = 0
        dentro = 0
        for clave in tipos:
            t = TIPOS[clave]
            confirmados += escalar(
                con,
                f'SELECT COUNT(*) FROM "{t["tabla"]}" WHERE "confirmado"',
            )
            dentro += escalar(
                con,
                f'SELECT COALESCE(SUM("asistencias"),0) FROM "{t["tabla"]}"',
            )
        hoy = filas(con, """
            SELECT
              COUNT(*) FILTER (WHERE ok AND modo = 'entrada') AS entradas,
              COUNT(*) FILTER (WHERE ok AND modo = 'salida') AS salidas,
              COUNT(*) FILTER (WHERE NOT ok) AS rechazos,
              COUNT(*) AS total
            FROM accesos_escaneos
            WHERE creado >= date_trunc('day', NOW() AT TIME ZONE 'America/Mexico_City')
                  AT TIME ZONE 'America/Mexico_City'
        """)
        zonas = filas(con, """
            SELECT id, clave, nombre, aforo, dentro, activo
            FROM accesos_zonas ORDER BY id
        """)
        recientes = filas(con, """
            SELECT id, creado, tipo, registro_id, nombre, modo, ok, mensaje, zona_clave
            FROM accesos_escaneos ORDER BY creado DESC LIMIT 12
        """)
    pulso = dict(hoy[0]) if hoy else {}
    return jsonify({
        **_sesion_json(),
        "confirmados": confirmados,
        "dentro": dentro,
        "entradasHoy": pulso.get("entradas") or 0,
        "salidasHoy": pulso.get("salidas") or 0,
        "rechazosHoy": pulso.get("rechazos") or 0,
        "escaneosHoy": pulso.get("total") or 0,
        "zonas": [dict(z) for z in zonas],
        "recientes": [_fila_escaneo(r) for r in recientes],
    })


def _fila_escaneo(r) -> dict:
    d = dict(r)
    creado = d.get("creado")
    if isinstance(creado, datetime):
        d["creado"] = creado.isoformat()
    return d


@bp.get("/buscar")
@rate_limit("api")
def buscar():
    q = (request.args.get("q") or "").strip()
    if len(q) > 120:
        return jsonify(ok=False, error="q_larga"), 400
    if len(q) < 2:
        return jsonify(q=q, results=[])
    # Bloquea wildcards / patrones abusivos
    if any(c in q for c in ("%", "_", ";", "--", "/*")):
        q = q.replace("%", "").replace("_", "")
    tipo_filtro = request.args.get("tipo") or ""
    tipos = [tipo_filtro] if tipo_filtro in _tipos_ok() else _tipos_ok()
    hits = _buscar_exacto(q, tipos) or _buscar_texto(q, tipos)
    return jsonify(q=q, results=hits[:20])


def _buscar_exacto(q: str, tipos: list[str]) -> list[dict]:
    tag, num = _parse_folio(q)
    candidatos = []
    if num is not None:
        if tag and tag in QR_A_TIPO:
            clave = QR_A_TIPO[tag]
            if clave in tipos:
                candidatos.append((clave, num))
        elif not tag:
            candidatos = [(t, num) for t in tipos]
    if not candidatos:
        return []
    with conexion() as con:
        for clave, ident in candidatos:
            fila = _obtener(con, clave, ident)
            if fila:
                return [_hit(clave, fila, "folio")]
    return []


def _parse_folio(q: str):
    s = q.strip().upper()
    m = re.match(r"^(EMPRESARIO|ALUMNO|ELISA_CARRILLO)-(\d+)$", s)
    if m:
        return m.group(1), int(m.group(2))
    if s.isdigit():
        return None, int(s)
    return None, None


def _buscar_texto(q: str, tipos: list[str]) -> list[dict]:
    """Prefijo primero (rápido), luego ILIKE %q% como respaldo."""
    out = []
    prefix = f"{q}%"
    like = f"%{q}%"
    with conexion() as con:
        for clave in tipos:
            t = TIPOS[clave]
            nombre = 'COALESCE("Nombre",\'\')'
            if clave != "elisa":
                nombre = (
                    "COALESCE(\"Nombre\",'') || ' ' || "
                    "COALESCE(\"ApellidoPaterno\",'')"
                )
            extra = (
                f' OR CAST("{t["extra"]}" AS TEXT) ILIKE :q' if t["extra"] else ""
            )
            # Prefijo / email exact-ish
            filas_ = filas(con, f'''
                SELECT * FROM "{t["tabla"]}"
                WHERE CAST("{t["id"]}" AS TEXT) ILIKE :pref
                   OR {nombre} ILIKE :pref
                   OR COALESCE("Correo",'') ILIKE :pref
                   OR COALESCE("Telefono",'') ILIKE :pref
                   {extra.replace(":q", ":pref") if extra else ""}
                ORDER BY "{t["id"]}" DESC
                LIMIT 12
            ''', pref=prefix)
            if not filas_:
                filas_ = filas(con, f'''
                    SELECT * FROM "{t["tabla"]}"
                    WHERE CAST("{t["id"]}" AS TEXT) ILIKE :q
                       OR {nombre} ILIKE :q
                       OR COALESCE("Correo",'') ILIKE :q
                       OR COALESCE("Telefono",'') ILIKE :q
                       {extra}
                    ORDER BY "{t["id"]}" DESC
                    LIMIT 12
                ''', q=like)
            for f in filas_:
                out.append(_hit(clave, dict(f), "texto"))
    return out


def _obtener(con, clave: str, ident: int):
    t = TIPOS[clave]
    rows = filas(con, f'''
        SELECT * FROM "{t["tabla"]}" WHERE "{t["id"]}" = :id
    ''', id=ident)
    return dict(rows[0]) if rows else None


def _nombre(fila: dict) -> str:
    partes = [fila.get("Nombre") or "", fila.get("ApellidoPaterno") or "",
              fila.get("ApellidoMaterno") or ""]
    return " ".join(p for p in partes if p).strip()


def _folio(clave: str, ident: int) -> str:
    return f"{TIPOS[clave]['qr']}-{ident}"


def _hit(clave: str, fila: dict, match: str) -> dict:
    t = TIPOS[clave]
    ident = fila[t["id"]]
    extra = fila.get(t["extra"]) if t["extra"] else None
    return {
        "tipo": clave,
        "tipoEtiqueta": t["etiqueta"],
        "id": ident,
        "folio": _folio(clave, ident),
        "nombre": _nombre(fila),
        "correo": fila.get("Correo") or "",
        "telefono": fila.get("Telefono") or "",
        "extra": extra or "",
        "confirmado": bool(fila.get("confirmado")),
        "asistencias": int(fila.get("asistencias") or 0),
        "dentro": int(fila.get("asistencias") or 0) > 0,
        "match": match,
    }


def _gafete_fila(tipo, id_):
    """Carga fila + etiqueta/extra o (None, err_response)."""
    if not _ops():
        return None, _forbid_ops()
    if tipo not in _tipos_ok():
        return None, (jsonify(ok=False, error="sin_acceso"), 403)
    with conexion() as con:
        fila = _obtener(con, tipo, id_)
    if not fila:
        return None, (jsonify(ok=False, error="no_encontrado"), 404)
    t = TIPOS[tipo]
    extra = (fila.get(t["extra"]) or "") if t["extra"] else ""
    return {
        "nombre": _nombre(fila),
        "folio": _folio(tipo, id_),
        "tipo": t["etiqueta"],
        "subtitulo": extra,
    }, None


@bp.get("/gafete/<tipo>/<int:id_>")
@rate_limit("api")
def gafete_json(tipo, id_):
    """Cara de boleto para preview React + impresión @media print."""
    datos, err = _gafete_fila(tipo, id_)
    if err:
        return err
    body = gafete_pdf.payload(
        nombre=datos["nombre"],
        folio=datos["folio"],
        tipo=datos["tipo"],
        subtitulo=datos["subtitulo"],
    )
    return jsonify(body)


@bp.get("/gafete/<tipo>/<int:id_>.pdf")
@rate_limit("api")
def gafete_pdf_ruta(tipo, id_):
    datos, err = _gafete_fila(tipo, id_)
    if err:
        return err
    pdf = gafete_pdf.construir(
        nombre=datos["nombre"],
        folio=datos["folio"],
        tipo=datos["tipo"],
        subtitulo=datos["subtitulo"],
    )
    return Response(
        pdf,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="gafete-{datos["folio"]}.pdf"',
            "Cache-Control": "no-store",
        },
    )


@bp.get("/zonas")
@rate_limit("api")
def zonas():
    with conexion() as con:
        rows = filas(con, """
            SELECT id, clave, nombre, aforo, dentro, activo
            FROM accesos_zonas ORDER BY id
        """)
    return jsonify(zonas=[dict(z) for z in rows], puedeOperar=_ops())


@bp.post("/zonas")
@rate_limit("mutacion")
def zonas_guardar():
    if not _ops():
        return _forbid_ops()
    datos = request.get_json(silent=True) or {}
    clave = re.sub(r"[^a-z0-9_-]", "", (datos.get("clave") or "").strip().lower())
    nombre = (datos.get("nombre") or "").strip()
    try:
        aforo = max(0, int(datos.get("aforo") or 0))
    except (TypeError, ValueError):
        return jsonify(ok=False, error="aforo_invalido"), 400
    if not clave or not nombre:
        return jsonify(ok=False, error="datos"), 400
    with conexion() as con:
        con.execute(text("""
            INSERT INTO accesos_zonas (clave, nombre, aforo)
            VALUES (:clave, :nombre, :aforo)
            ON CONFLICT (clave) DO UPDATE
              SET nombre = EXCLUDED.nombre, aforo = EXCLUDED.aforo, activo = TRUE
        """), {"clave": clave, "nombre": nombre, "aforo": aforo})
        con.commit()
        rows = filas(con, "SELECT id, clave, nombre, aforo, dentro, activo FROM accesos_zonas ORDER BY id")
    return jsonify(ok=True, zonas=[dict(z) for z in rows])


@bp.post("/escanear")
@rate_limit("mutacion")
def escanear():
    if not _ops():
        return _forbid_ops()
    datos = request.get_json(silent=True) or {}
    qr = (datos.get("qr") or datos.get("qr_data") or "").strip()
    modo = (datos.get("modo") or "entrada").strip().lower()
    zona_clave = (datos.get("zona") or ZONA_DEFECTO).strip().lower()
    if len(qr) > 80:
        return jsonify(ok=False, error="qr_largo"), 400
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,80}", qr):
        return jsonify(_resultado(
            False, "CODIGO INVALIDO", "El QR no tiene un formato reconocido.", "", "", 0)), 400
    if modo not in ("entrada", "salida"):
        return jsonify(ok=False, error="modo"), 400
    if not re.fullmatch(r"[a-z0-9_-]{1,40}", zona_clave):
        return jsonify(ok=False, error="zona"), 400
    if not qr:
        return jsonify(_resultado(False, "SIN DATOS", "No se recibió ningún código.", "", "", 0)), 400
    return jsonify(_procesar(qr, modo, zona_clave, session.get("usuario") or "", "panel"))


def _resultado(ok, mensaje, detalles, nombre, tipo, asistencias, **extra):
    out = {
        "ok": ok,
        "mensaje": mensaje,
        "detalles": detalles,
        "pitido": "exito" if ok else "error",
        "nombre": nombre,
        "tipo": tipo,
        "asistencias": asistencias,
        "dentro": asistencias > 0,
    }
    out.update(extra)
    return out


def _meta_zona(zona) -> dict:
    if not zona:
        return {"zona": ZONA_DEFECTO, "zonaNombre": "", "zonaDentro": 0, "zonaAforo": 0}
    return {
        "zona": zona["clave"],
        "zonaNombre": zona.get("nombre") or zona["clave"],
        "zonaDentro": int(zona.get("dentro") or 0),
        "zonaAforo": int(zona.get("aforo") or 0),
    }


def _resolver(qr: str):
    tag, num = _parse_folio(qr)
    tipos = _tipos_ok()
    with conexion() as con:
        if num is None:
            return None, None, None
        if tag and tag in QR_A_TIPO:
            clave = QR_A_TIPO[tag]
            if clave not in tipos:
                return None, None, None
            fila = _obtener(con, clave, num)
            return (clave, fila, num) if fila else (None, None, None)
        for clave in tipos:
            fila = _obtener(con, clave, num)
            if fila:
                return clave, fila, num
    return None, None, None


def _procesar(qr: str, modo: str, zona_clave: str, operador: str, origen: str):
    clave, fila, ident = _resolver(qr)
    if not fila:
        res = _resultado(False, "ACCESO DENEGADO",
                         f'El código "{qr}" no está registrado.', "", "", 0)
        _log(None, None, "", modo, False, res["mensaje"], zona_clave, origen, operador)
        return res

    nombre = _nombre(fila)
    etiqueta = TIPOS[clave]["etiqueta"]
    asistencias = int(fila.get("asistencias") or 0)
    t = TIPOS[clave]

    with conexion() as con:
        zona = filas(con, "SELECT * FROM accesos_zonas WHERE clave = :c AND activo", c=zona_clave)
        if not zona:
            zona = filas(con, "SELECT * FROM accesos_zonas WHERE clave = :c AND activo", c=ZONA_DEFECTO)
        zona = dict(zona[0]) if zona else None

        if not bool(fila.get("confirmado")):
            res = _resultado(
                False, "NO CONFIRMADO",
                f"{nombre} aún no confirmó su registro por correo.",
                nombre, etiqueta, asistencias, **_meta_zona(zona),
            )
            _log_con(con, clave, ident, nombre, modo, False, res["mensaje"], zona_clave, origen, operador)
            con.commit()
            return res

        if modo == "salida":
            if asistencias <= 0:
                res = _resultado(
                    False, "SALIDA DENEGADA",
                    f"{nombre} no tiene una entrada activa. No hay reingreso pendiente.",
                    nombre, etiqueta, asistencias, **_meta_zona(zona),
                )
                _log_con(con, clave, ident, nombre, modo, False, res["mensaje"], zona_clave, origen, operador)
                con.commit()
                return res
            con.execute(text(
                f'UPDATE "{t["tabla"]}" SET asistencias = GREATEST(COALESCE(asistencias,0) - 1, 0) '
                f'WHERE "{t["id"]}" = :id'
            ), {"id": ident})
            if zona:
                con.execute(text(
                    "UPDATE accesos_zonas SET dentro = GREATEST(dentro - 1, 0) WHERE clave = :c"
                ), {"c": zona["clave"]})
                zona["dentro"] = max(int(zona.get("dentro") or 0) - 1, 0)
            nueva = max(asistencias - 1, 0)
            res = _resultado(
                True, "SALIDA REGISTRADA",
                f"{nombre} ({etiqueta}). Puede reingresar con ENTRADA.",
                nombre, etiqueta, nueva, **_meta_zona(zona),
            )
            _log_con(con, clave, ident, nombre, modo, True, res["mensaje"], zona_clave, origen, operador)
            con.commit()
            return res

        if asistencias >= 1:
            res = _resultado(
                False, "YA DENTRO",
                f"{nombre} ya ingresó. Escanea SALIDA antes del reingreso.",
                nombre, etiqueta, asistencias, **_meta_zona(zona),
            )
            _log_con(con, clave, ident, nombre, modo, False, res["mensaje"], zona_clave, origen, operador)
            con.commit()
            return res

        if zona and zona["aforo"] > 0 and zona["dentro"] >= zona["aforo"]:
            res = _resultado(
                False, "ZONA LLENA",
                f'{zona["nombre"]} está al aforo ({zona["dentro"]}/{zona["aforo"]}).',
                nombre, etiqueta, asistencias, **_meta_zona(zona),
            )
            _log_con(con, clave, ident, nombre, modo, False, res["mensaje"], zona["clave"], origen, operador)
            con.commit()
            return res

        con.execute(text(
            f'UPDATE "{t["tabla"]}" SET asistencias = COALESCE(asistencias,0) + 1 '
            f'WHERE "{t["id"]}" = :id'
        ), {"id": ident})
        if zona:
            con.execute(text(
                "UPDATE accesos_zonas SET dentro = dentro + 1 WHERE clave = :c"
            ), {"c": zona["clave"]})
            zona["dentro"] = int(zona.get("dentro") or 0) + 1
        res = _resultado(
            True, "ENTRADA REGISTRADA",
            f"{nombre} ({etiqueta})",
            nombre, etiqueta, asistencias + 1,
            **_meta_zona(zona),
        )
        _log_con(con, clave, ident, nombre, modo, True, res["mensaje"],
                 zona["clave"] if zona else zona_clave, origen, operador)
        con.commit()
        return res


def _log(tipo, registro_id, nombre, modo, ok, mensaje, zona, origen, operador):
    with conexion() as con:
        _log_con(con, tipo, registro_id, nombre, modo, ok, mensaje, zona, origen, operador)
        con.commit()


def _log_con(con, tipo, registro_id, nombre, modo, ok, mensaje, zona, origen, operador):
    con.execute(text("""
        INSERT INTO accesos_escaneos
            (tipo, registro_id, nombre, modo, ok, mensaje, zona_clave, origen, operador)
        VALUES
            (:tipo, :rid, :nombre, :modo, :ok, :mensaje, :zona, :origen, :operador)
    """), {
        "tipo": tipo or "desconocido",
        "rid": registro_id or 0,
        "nombre": (nombre or "")[:200],
        "modo": modo,
        "ok": ok,
        "mensaje": (mensaje or "")[:160],
        "zona": zona,
        "origen": origen,
        "operador": operador or None,
    })


@bp.get("/reportes")
@rate_limit("api")
def reportes():
    modo = request.args.get("modo") or ""
    ok_arg = request.args.get("ok")
    zona = request.args.get("zona") or ""
    q = (request.args.get("q") or "").strip()
    if len(q) > 120:
        return jsonify(ok=False, error="q_larga"), 400
    formato = (request.args.get("formato") or "json").lower()
    try:
        limite = min(int(request.args.get("limite") or 200), 2000)
    except (TypeError, ValueError):
        return jsonify(ok=False, error="limite"), 400

    cond = ["TRUE"]
    params = {"limite": limite}
    if modo in ("entrada", "salida"):
        cond.append("modo = :modo")
        params["modo"] = modo
    if ok_arg in ("1", "0", "true", "false"):
        cond.append("ok = :ok")
        params["ok"] = ok_arg in ("1", "true")
    if zona:
        if not re.fullmatch(r"[a-z0-9_-]{1,40}", zona):
            return jsonify(ok=False, error="zona"), 400
        cond.append("zona_clave = :zona")
        params["zona"] = zona
    if q:
        cond.append("(nombre ILIKE :q OR CAST(registro_id AS TEXT) ILIKE :q)")
        params["q"] = f"%{q}%"
    donde = " AND ".join(cond)

    with conexion() as con:
        kpis = filas(con, f"""
            SELECT
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE ok AND modo = 'entrada') AS entradas,
              COUNT(*) FILTER (WHERE ok AND modo = 'salida') AS salidas,
              COUNT(*) FILTER (WHERE NOT ok) AS rechazos,
              COUNT(*) FILTER (
                WHERE ok AND modo = 'entrada'
                  AND EXISTS (
                    SELECT 1 FROM accesos_escaneos s2
                    WHERE s2.ok AND s2.modo = 'salida'
                      AND s2.tipo = accesos_escaneos.tipo
                      AND s2.registro_id = accesos_escaneos.registro_id
                      AND s2.creado < accesos_escaneos.creado
                  )
              ) AS reingresos
            FROM accesos_escaneos WHERE {donde}
        """, **{k: v for k, v in params.items() if k != "limite"})
        zonas_opts = filas(con, """
            SELECT clave, nombre FROM accesos_zonas WHERE activo ORDER BY id
        """)
        rows = filas(con, f"""
            SELECT id, creado, tipo, registro_id, nombre, modo, ok, mensaje, zona_clave, origen, operador
            FROM accesos_escaneos
            WHERE {donde}
            ORDER BY creado DESC
            LIMIT :limite
        """, **params)

    registros = [_fila_escaneo(r) for r in rows]
    pulso = dict(kpis[0]) if kpis else {}
    if formato == "csv":
        return _csv(registros)
    if formato in ("xlsx", "xls"):
        return _xlsx(registros)
    return jsonify(
        kpis=pulso,
        registros=registros,
        zonas=[{"clave": z["clave"], "nombre": z["nombre"]} for z in zonas_opts],
        puedeOperar=_ops(),
    )


def _csv(registros):
    sio = StringIO()
    w = csv.writer(sio)
    w.writerow(["hora", "ok", "modo", "nombre", "tipo", "folio_id", "zona", "mensaje", "origen", "operador"])
    for r in registros:
        w.writerow([
            r.get("creado"), r.get("ok"), r.get("modo"), r.get("nombre"),
            r.get("tipo"), r.get("registro_id"), r.get("zona_clave"),
            r.get("mensaje"), r.get("origen"), r.get("operador"),
        ])
    data = sio.getvalue().encode("utf-8-sig")
    return Response(data, mimetype="text/csv; charset=utf-8", headers={
        "Content-Disposition": 'attachment; filename="accesos-ficti.csv"',
        "Cache-Control": "no-store",
    })


def _xlsx(registros):
    wb = Workbook()
    ws = wb.active
    ws.title = "Accesos"
    ws.append(["Hora", "OK", "Modo", "Nombre", "Tipo", "ID", "Zona", "Mensaje", "Origen", "Operador"])
    for r in registros:
        ws.append([
            r.get("creado"), r.get("ok"), r.get("modo"), r.get("nombre"),
            r.get("tipo"), r.get("registro_id"), r.get("zona_clave"),
            r.get("mensaje"), r.get("origen"), r.get("operador"),
        ])
    bio = BytesIO()
    wb.save(bio)
    return Response(bio.getvalue(),
                    mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={
                        "Content-Disposition": 'attachment; filename="accesos-ficti.xlsx"',
                        "Cache-Control": "no-store",
                    })
