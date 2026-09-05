# -*- coding: utf-8 -*-
"""Controles de seguridad compartidos del panel FICTI."""
from __future__ import annotations

import hmac
import time
from collections import defaultdict
from functools import wraps
from threading import Lock

from flask import jsonify, redirect, request, session, url_for


class Limitador:
    """Rate limit en memoria por clave (IP + ruta). Suficiente para 3 workers
    gunicorn: cada worker tiene su propio contador (peor caso 3× el tope)."""

    def __init__(self, maximo: int, ventana_s: float):
        self.maximo = maximo
        self.ventana = ventana_s
        self._marcas: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def permitir(self, clave: str) -> bool:
        ahora = time.time()
        with self._lock:
            marcas = [t for t in self._marcas[clave] if ahora - t < self.ventana]
            if len(marcas) >= self.maximo:
                self._marcas[clave] = marcas
                return False
            marcas.append(ahora)
            self._marcas[clave] = marcas
            return True


_limite_api = Limitador(90, 60.0)       # búsqueda / lectura
_limite_mutacion = Limitador(40, 60.0)  # escaneo / zonas
_limite_login = Limitador(20, 60.0)


def ip_cliente() -> str:
    reenviado = request.headers.get("X-Forwarded-For", "")
    return reenviado.split(",")[0].strip() or request.remote_addr or "?"


def login_requerido(vista):
    @wraps(vista)
    def envoltura(*args, **kwargs):
        if not session.get("usuario"):
            if request.path.startswith("/api/"):
                return jsonify(ok=False, error="sesion_expirada"), 401
            return redirect(url_for("login", next=request.path))
        return vista(*args, **kwargs)
    return envoltura


def origen_confiable() -> bool:
    """CSRF básico: mutaciones deben venir del mismo host (Origin/Referer)."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return True
    host = request.host.split(":")[0].lower()
    permitidos = {
        f"https://{host}",
        f"https://panel.experiencebt.com.mx",
    }
    # Solo en desarrollo local permitimos http
    if host in ("127.0.0.1", "localhost"):
        permitidos |= {f"http://{host}", f"http://{host}:5000", f"http://{host}:5173"}

    origin = (request.headers.get("Origin") or "").rstrip("/")
    if origin:
        return origin in permitidos

    referer = request.headers.get("Referer") or ""
    return any(referer.startswith(p + "/") or referer == p for p in permitidos)


def rate_limit(kind: str = "api"):
    def deco(vista):
        @wraps(vista)
        def envoltura(*args, **kwargs):
            lim = _limite_mutacion if kind == "mutacion" else _limite_api
            clave = f"{kind}:{ip_cliente()}:{request.endpoint}"
            if not lim.permitir(clave):
                return jsonify(ok=False, error="rate_limit"), 429
            return vista(*args, **kwargs)
        return envoltura
    return deco


def constant_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest((a or "").encode(), (b or "").encode())
