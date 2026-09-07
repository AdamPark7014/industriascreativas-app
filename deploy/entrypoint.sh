#!/bin/sh
set -e
# Migración de esquema al arrancar el contenedor.
#
# Antes esto llevaba su propia lista de ALTER, copiada de `ensure_schema()` en
# backend/app.py. Las dos listas se desincronizaron: las columnas nuevas se
# agregaban en `ensure_schema()`, que solo corre bajo `if __name__ == '__main__'`
# — y en producción arranca gunicorn, así que nunca se ejecutaba. Resultado:
# columnas que existían en el modelo y no en la base.
#
# Ahora hay una sola fuente: se llama a `ensure_schema()`. Es idempotente
# (ADD COLUMN IF NOT EXISTS), así que repetirlo en cada arranque no cuesta nada.
python - <<'PY'
from backend.app import app, db, ensure_schema

with app.app_context():
    db.create_all()
    ensure_schema()
    print("DB tables ready + columns migrated")
PY
exec gunicorn --bind 0.0.0.0:5000 --workers 3 --timeout 120 "backend.app:app"
