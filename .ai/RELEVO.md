# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** main

## Hecho (este turno)
Deploy Accesos embed en DO `147.182.128.128`:
- `/opt/EVENTOS-app/panel` → rebuild `eventos_panel_web` con nav Accesos + iframe Nest.
- `NEST_ACCESS_BASE_URL` en compose + `.env` del servidor (default manager.demo).
- Local: `panel/docker-compose.panel.yml` ahora exporta `NEST_ACCESS_BASE_URL`.

Smoke: panel login/health 200; Accesos + embed/access en imagen.

## Blocker
DNS A `manager.demo.experiencebt.com.mx` → `5.78.215.109` (Hetzner) para que el iframe cargue HTTPS. Panel Flask **no** se mueve de DO.

## No tocar
Cutover panel DNS a Nest; secretos en git/RELEVO.
