# -*- coding: utf-8 -*-
"""Seeder del panel: crea la tabla panel_usuarios y sus usuarios.

Es idempotente: si un usuario ya existe actualiza su hash, su alcance y lo
reactiva, así que puede correrse en cada arranque sin duplicar ni perder el
acceso. Cualquier usuario que no venga en la configuración queda desactivado.

Alcances (ver consultas.ALCANCES):
    interno   → empresas, estudiantes y evento Elisa Carrillo
    promotor  → empresas y estudiantes

    python seed.py
"""
import os
import sys

from pathlib import Path

from sqlalchemy import create_engine, text
from werkzeug.security import generate_password_hash

DDL = '''
CREATE TABLE IF NOT EXISTS panel_usuarios (
    id            SERIAL PRIMARY KEY,
    usuario       VARCHAR(50)  NOT NULL UNIQUE,
    clave_hash    VARCHAR(255) NOT NULL,
    nombre        VARCHAR(100) NOT NULL,
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    creado        TIMESTAMP    NOT NULL DEFAULT NOW(),
    ultimo_acceso TIMESTAMP
);
'''

# Migración para las bases que ya tenían la tabla sin la columna de alcance.
MIGRACION = '''
ALTER TABLE panel_usuarios
    ADD COLUMN IF NOT EXISTS alcance VARCHAR(20) NOT NULL DEFAULT 'promotor';
'''

UPSERT = '''
INSERT INTO panel_usuarios (usuario, clave_hash, nombre, alcance, activo)
VALUES (:usuario, :clave_hash, :nombre, :alcance, TRUE)
ON CONFLICT (usuario) DO UPDATE
    SET clave_hash = EXCLUDED.clave_hash,
        nombre     = EXCLUDED.nombre,
        alcance    = EXCLUDED.alcance,
        activo     = TRUE
RETURNING (xmax = 0) AS creado;
'''


def _configurados() -> list:
    """Usuarios a sembrar, tomados del entorno."""
    definidos = [
        {
            "usuario": os.getenv("PANEL_USER", "admin").strip().lower(),
            "clave": os.getenv("PANEL_PASSWORD", "").strip(),
            "nombre": os.getenv("PANEL_NOMBRE", "Administrador"),
            "alcance": "interno",
        },
        {
            "usuario": os.getenv("PANEL_PROMOTOR_USER", "promotor").strip().lower(),
            "clave": os.getenv("PANEL_PROMOTOR_PASSWORD", "").strip(),
            "nombre": os.getenv("PANEL_PROMOTOR_NOMBRE", "Promotor"),
            "alcance": "promotor",
        },
    ]
    definidos += _equipo_mesa()
    return [u for u in definidos if u["usuario"] and u["clave"]]


# Equipo de la mesa de atención del evento. Nombres y roles van en código; las
# claves solo en el .env del servidor:
#   PANEL_EQUIPO_CLAVES="registro1:xxxx,registro2:xxxx,...,controladm:xxxx"
# Quien no tenga clave en esa lista no se crea (y si existía, queda desactivado).
EQUIPO_MESA = (
    [(f"registro{n}", f"Registro {n}", "registro") for n in range(1, 6)]
    + [(f"impresion{n}", f"Impresión {n}", "impresion") for n in range(1, 6)]
    + [("controladm", "Control ADM", "control")]
)


def _equipo_mesa() -> list:
    claves = {}
    for par in os.getenv("PANEL_EQUIPO_CLAVES", "").split(","):
        usuario, _, clave = par.strip().partition(":")
        if usuario and clave:
            claves[usuario.strip().lower()] = clave.strip()
    return [
        {"usuario": usuario, "clave": claves.get(usuario, ""), "nombre": nombre, "alcance": alcance}
        for usuario, nombre, alcance in EQUIPO_MESA
    ]


def _sql_statements(sql: str) -> list[str]:
    """Parte un .sql en sentencias (el driver no acepta varias a la vez)."""
    out = []
    buf = []
    for linea in sql.splitlines():
        if linea.strip().startswith("--"):
            continue
        buf.append(linea)
        if linea.rstrip().endswith(";"):
            stmt = "\n".join(buf).strip().rstrip(";")
            if stmt:
                out.append(stmt)
            buf = []
    resto = "\n".join(buf).strip().rstrip(";")
    if resto:
        out.append(resto)
    return out


def main() -> int:
    url = os.getenv("DATABASE_URL", "")
    if not url:
        print("ERROR: falta DATABASE_URL")
        return 1

    usuarios = _configurados()
    if not usuarios:
        print("ERROR: no hay usuarios configurados (falta PANEL_PASSWORD)")
        return 1

    engine = create_engine(url, pool_pre_ping=True)
    with engine.begin() as con:
        con.execute(text(DDL))
        con.execute(text(MIGRACION))
        sql_accesos = Path(__file__).resolve().parent / "migraciones" / "002_accesos.sql"
        if sql_accesos.exists():
            for stmt in _sql_statements(sql_accesos.read_text(encoding="utf-8")):
                con.execute(text(stmt))

        for u in usuarios:
            creado = con.execute(text(UPSERT), {
                "usuario": u["usuario"],
                "clave_hash": generate_password_hash(u["clave"], method="pbkdf2:sha256"),
                "nombre": u["nombre"],
                "alcance": u["alcance"],
            }).scalar()
            print(f"{'Creado' if creado else 'Actualizado'} '{u['usuario']}' "
                  f"(alcance: {u['alcance']})")

        nombres = [u["usuario"] for u in usuarios]
        sobrantes = con.execute(
            text('UPDATE panel_usuarios SET activo = FALSE '
                 'WHERE usuario <> ALL(:lista)'), {"lista": nombres}).rowcount
        activos = con.execute(
            text("SELECT COUNT(*) FROM panel_usuarios WHERE activo")).scalar()

    if sobrantes:
        print(f"Desactivados {sobrantes} usuario(s) fuera de la configuración.")
    print(f"panel_usuarios: {activos} activo(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
