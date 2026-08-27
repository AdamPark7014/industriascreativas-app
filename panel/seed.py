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
    return [u for u in definidos if u["usuario"] and u["clave"]]


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
