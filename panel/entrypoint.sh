#!/bin/sh
set -e

# El seeder es idempotente: asegura la tabla y el usuario unico en cada arranque.
python seed.py

exec gunicorn --bind 0.0.0.0:5000 --workers 3 --timeout 60 --access-logfile - "app:app"
