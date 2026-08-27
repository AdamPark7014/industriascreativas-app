# -*- coding: utf-8 -*-
"""Capa de conexión a PostgreSQL.

Centraliza el pool, los tiempos límite y el manejo de errores para que una
caída o lentitud de la base degrade el panel con un aviso en vez de tumbarlo.
"""
import logging
import os
import threading
import time
from contextlib import contextmanager

from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import QueuePool

log = logging.getLogger("panel.db")

DATABASE_URL = os.getenv("DATABASE_URL", "")
TIEMPO_LIMITE_MS = int(os.getenv("PANEL_STATEMENT_TIMEOUT_MS", "8000"))

# Pool dimensionado para 3 workers de gunicorn con sondeo cada pocos segundos.
engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=5,
    pool_timeout=10,
    pool_recycle=1800,
    pool_pre_ping=True,
    connect_args={
        "connect_timeout": 8,
        # Ninguna consulta del panel debe poder colgar un worker.
        "options": f"-c statement_timeout={TIEMPO_LIMITE_MS}",
        "application_name": "panel_control",
    },
)


@event.listens_for(engine, "connect")
def _al_conectar(dbapi_conn, registro):
    registro.info["abierta_en"] = time.time()


class ErrorBaseDatos(RuntimeError):
    """Falla al hablar con la base; el panel la muestra como aviso."""


@contextmanager
def conexion():
    """Entrega una conexión del pool y traduce cualquier fallo a ErrorBaseDatos."""
    try:
        con = engine.connect()
    except SQLAlchemyError as exc:
        log.error("No se pudo obtener conexión: %s", exc)
        raise ErrorBaseDatos("Sin conexión a la base de datos") from exc

    try:
        yield con
    except SQLAlchemyError as exc:
        log.error("Error ejecutando consulta: %s", exc)
        raise ErrorBaseDatos(str(exc).split("\n")[0]) from exc
    finally:
        con.close()


def filas(con, sql, **params):
    return con.execute(text(sql), params).mappings().all()


def escalar(con, sql, defecto=0, **params):
    valor = con.execute(text(sql), params).scalar()
    return defecto if valor is None else valor


def estado() -> dict:
    """Diagnóstico de la conexión: latencia y ocupación del pool."""
    inicio = time.perf_counter()
    try:
        with conexion() as con:
            version = con.execute(text("SHOW server_version")).scalar()
            base = con.execute(text("SELECT current_database()")).scalar()
        latencia = round((time.perf_counter() - inicio) * 1000, 1)
        return {
            "ok": True,
            "latencia_ms": latencia,
            "base": base,
            "postgres": version,
            "pool": {
                "en_uso": engine.pool.checkedout(),
                "disponibles": engine.pool.checkedin(),
                "tamano": engine.pool.size(),
            },
        }
    except ErrorBaseDatos as exc:
        return {"ok": False, "error": str(exc)}


class CacheCorto:
    """Cache con vencimiento por segundos, para no repetir la misma consulta
    cuando varias pestañas sondean a la vez."""

    def __init__(self, segundos: float):
        self.segundos = segundos
        self._valor = None
        self._sello = 0.0
        self._candado = threading.Lock()

    def obtener(self, productor):
        ahora = time.time()
        with self._candado:
            if self._valor is not None and ahora - self._sello < self.segundos:
                return self._valor
        valor = productor()
        with self._candado:
            self._valor = valor
            self._sello = time.time()
        return valor

    def invalidar(self):
        with self._candado:
            self._valor = None
