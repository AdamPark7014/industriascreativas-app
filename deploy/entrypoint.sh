#!/bin/sh
set -e
python - <<'PY'
from sqlalchemy import text
from backend.app import app, db

with app.app_context():
    db.create_all()
    alters = [
        'ALTER TABLE "Registro_Empresarios" ADD COLUMN IF NOT EXISTS "Estado" VARCHAR(100)',
        'ALTER TABLE "Registro_Alumnos" ADD COLUMN IF NOT EXISTS "InstitucionEducativa" VARCHAR(200)',
        'ALTER TABLE "Registro_Alumnos" ADD COLUMN IF NOT EXISTS "Grado" VARCHAR(100)',
    ]
    for sql in alters:
        db.session.execute(text(sql))
    db.session.commit()
    print("DB tables ready + columns migrated")
PY
exec gunicorn --bind 0.0.0.0:5000 --workers 3 --timeout 120 "backend.app:app"
