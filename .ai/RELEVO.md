# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** main

## 3 líneas
Accesos same-origin: nginx `zz-panel.conf` proxea Nest bajo panel; `NEST_ACCESS_BASE_URL=https://panel.experiencebt.com.mx`. Sin `manager.demo`.

## Hecho
- `panel/deploy/zz-panel.conf` (+ssl): locations Nest → manager.terror + X-EBT-Public-Host.
- app.py / panel.html / panel.js / compose: base URL panel (no NXDOMAIN).
- Deploy DO: reload nginx + recreate `eventos_panel_web`.

## Smoke
panel `/login` 200; `/embed/access` 200 FICTI; scanner/zones/reports 200.

## No tocar
Cutover panel DNS a Nest; secretos en git/RELEVO.
