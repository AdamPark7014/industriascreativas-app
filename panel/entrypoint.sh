#!/bin/sh
set -e

# El seeder es idempotente: asegura la tabla y el usuario unico en cada arranque.
python seed.py

# 120 s es solo red de seguridad: el Excel completo (~10 mil registros) tarda
# ~18 s en el droplet; con 60 s el libro viejo cortaba la descarga (29-10-2026).
exec gunicorn --bind 0.0.0.0:5000 --workers 3 --timeout 120 --access-logfile - "app:app"
