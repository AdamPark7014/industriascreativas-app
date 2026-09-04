# -*- coding: utf-8 -*-
"""Panel de control — panel.experiencebt.com.mx

Lee la misma base bd_demo que el registro (demo.experiencebt.com.mx) y expone
conteo, estadísticas, consulta de registros y exportación a Excel.
Solo lectura sobre las tablas de registro; la única tabla propia es
panel_usuarios.
"""
import logging
import os
import time
from datetime import datetime, timedelta
from functools import wraps
from zoneinfo import ZoneInfo

from flask import (
    Flask, Response, flash, jsonify, redirect, render_template, request,
    session, url_for,
)
from sqlalchemy import text
from werkzeug.security import check_password_hash

import consultas
import exportar
from db import CacheCorto, ErrorBaseDatos, conexion, estado

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("panel")

TZ = ZoneInfo("America/Mexico_City")

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("PANEL_SECRET_KEY", os.urandom(32).hex())
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("PANEL_COOKIE_SECURE", "1") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
    JSON_SORT_KEYS=False,
)

# Varias pestañas sondeando cada pocos segundos comparten el mismo resultado.
# Una caché por alcance: los datos de cada rol no se mezclan.
_cache_resumen: dict[str, CacheCorto] = {}

MAX_INTENTOS = 8
VENTANA_BLOQUEO = 15 * 60
_intentos: dict[str, list[float]] = {}


def _ip_cliente() -> str:
    reenviado = request.headers.get("X-Forwarded-For", "")
    return reenviado.split(",")[0].strip() or request.remote_addr or "?"


def _bloqueado(ip: str) -> bool:
    ahora = time.time()
    marcas = [t for t in _intentos.get(ip, []) if ahora - t < VENTANA_BLOQUEO]
    _intentos[ip] = marcas
    return len(marcas) >= MAX_INTENTOS


def login_requerido(vista):
    @wraps(vista)
    def envoltura(*args, **kwargs):
        if not session.get("usuario"):
            if request.path.startswith("/api/"):
                return jsonify(ok=False, error="sesion_expirada"), 401
            return redirect(url_for("login", next=request.path))
        return vista(*args, **kwargs)
    return envoltura


def _tipos_sesion() -> list:
    """Tablas que puede ver quien tiene la sesión abierta."""
    return consultas.tipos_de(session.get("alcance", "promotor"))


def _puede(tipo: str) -> bool:
    return tipo in _tipos_sesion()


@app.errorhandler(ErrorBaseDatos)
def _error_bd(exc):
    log.error("Base de datos no disponible: %s", exc)
    if request.path.startswith("/api/"):
        return jsonify(ok=False, error="base_no_disponible", detalle=str(exc)), 503
    return render_template("error.html", detalle=str(exc)), 503


# ==========================================
# SESION
# ==========================================

@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("usuario"):
        return redirect(url_for("panel"))

    if request.method == "POST":
        ip = _ip_cliente()
        if _bloqueado(ip):
            flash("Demasiados intentos fallidos. Espera 15 minutos.", "error")
            return render_template("login.html"), 429

        usuario = (request.form.get("usuario") or "").strip().lower()
        clave = request.form.get("clave") or ""

        with conexion() as con:
            fila = con.execute(
                text('SELECT usuario, clave_hash, nombre, activo, alcance '
                     'FROM panel_usuarios WHERE usuario = :u'),
                {"u": usuario},
            ).mappings().first()

        if fila and fila["activo"] and check_password_hash(fila["clave_hash"], clave):
            session.permanent = True
            session["usuario"] = fila["usuario"]
            session["nombre"] = fila["nombre"]
            session["alcance"] = fila["alcance"] or "promotor"
            _intentos.pop(ip, None)
            with conexion() as con:
                con.execute(text('UPDATE panel_usuarios SET ultimo_acceso = NOW() '
                                 'WHERE usuario = :u'), {"u": usuario})
                con.commit()
            log.info("Acceso concedido a '%s' desde %s", usuario, ip)
            destino = request.args.get("next")
            return redirect(destino if destino and destino.startswith("/")
                            else url_for("panel"))

        _intentos.setdefault(ip, []).append(time.time())
        log.warning("Intento fallido de '%s' desde %s", usuario, ip)
        flash("Usuario o contraseña incorrectos.", "error")

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ==========================================
# VISTA
# ==========================================

@app.route("/")
@login_requerido
def panel():
    alcance = session.get("alcance", "promotor")
    # El catálogo que llega al navegador ya viene recortado al alcance.
    return render_template(
        "panel.html",
        alcance=alcance,
        alcance_nombre={"interno": "Interno", "promotor": "Promotor"}.get(
            alcance, alcance.capitalize()),
        nest_access_base=os.getenv(
            "NEST_ACCESS_BASE_URL",
            "https://manager.demo.experiencebt.com.mx",
        ).rstrip("/"),
        catalogo={
            clave: {"nombre": consultas.CATALOGO[clave]["nombre"],
                    "corto": consultas.CATALOGO[clave]["corto"],
                    "descripcion": consultas.CATALOGO[clave]["descripcion"],
                    "acento": consultas.CATALOGO[clave]["acento"],
                    "id": consultas.CATALOGO[clave]["id"],
                    "tarjeta": consultas.CATALOGO[clave]["tarjeta"],
                    "columnas": consultas.columnas_publicas(clave)}
            for clave in _tipos_sesion()
        })


# ==========================================
# API
# ==========================================

@app.route("/api/resumen")
@login_requerido
def api_resumen():
    tipos = _tipos_sesion()
    # Una caché por alcance: no se puede servir a un promotor lo del interno.
    cache = _cache_resumen.setdefault(session.get("alcance", "promotor"),
                                      CacheCorto(segundos=2.0))
    datos = cache.obtener(lambda: consultas.resumen(tipos))
    return jsonify({
        **datos,
        "servidor": datetime.now(TZ).strftime("%H:%M:%S"),
        "conexion": estado(),
    })


@app.route("/api/registros/<tipo>")
@login_requerido
def api_registros(tipo):
    if not _puede(tipo):
        return jsonify(ok=False, error="sin_acceso"), 403
    try:
        return jsonify(consultas.listar(
            tipo,
            q=(request.args.get("q") or "").strip(),
            orden=request.args.get("orden"),
            dir_=request.args.get("dir", "asc"),
            pagina=request.args.get("pagina", 1, type=int),
            por_pagina=request.args.get("por_pagina", 25, type=int),
            solo=request.args.get("solo"),
        ))
    except KeyError:
        return jsonify(ok=False, error="tipo_desconocido"), 404


@app.route("/api/registro/<tipo>/<int:id_>")
@login_requerido
def api_registro(tipo, id_):
    if not _puede(tipo):
        return jsonify(ok=False, error="sin_acceso"), 403
    try:
        reg = consultas.obtener(tipo, id_)
    except KeyError:
        return jsonify(ok=False, error="tipo_desconocido"), 404
    if not reg:
        return jsonify(ok=False, error="no_encontrado"), 404
    return jsonify({"registro": reg, "columnas": consultas.columnas_publicas(tipo)})


@app.route("/api/exportar.xlsx")
@app.route("/api/exportar/<tipo>.xlsx")
@login_requerido
def api_exportar(tipo=None):
    if tipo and tipo not in consultas.CATALOGO:
        return jsonify(ok=False, error="tipo_desconocido"), 404
    if tipo and not _puede(tipo):
        return jsonify(ok=False, error="sin_acceso"), 403
    # Sin tipo se exporta todo lo que el alcance permita, no todo el catálogo.
    alcance = session.get("alcance", "promotor")
    contenido, nombre = exportar.construir(
        [tipo] if tipo else _tipos_sesion(), alcance=alcance)
    log.info("Exportación Excel '%s' (%d KB) por '%s'",
             nombre, len(contenido) // 1024, session.get("usuario"))
    return Response(
        contenido,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{nombre}"',
            "Content-Length": str(len(contenido)),
            "Cache-Control": "no-store",
        },
    )


@app.route("/health")
def health():
    diag = estado()
    return jsonify({"servicio": "panel", **diag}), (200 if diag["ok"] else 503)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
