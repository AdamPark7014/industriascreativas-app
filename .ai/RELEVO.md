# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** main

## Hecho (este turno)
Embed Nest access-control into Flask panel FICTI (Adam): nav **Accesos** + iframe a
`manager.demo…/embed/access`. Sin cutover DNS de panel. Terror intacto.

Archivos: `panel/templates/panel.html`, `panel/static/js/panel.js`,
`panel/static/css/panel.css`, `panel/app.py` (`NEST_ACCESS_BASE_URL`).

## Deploy
Redeploy `eventos_panel_web` en DO. Motor Nest requiere A `manager.demo` → Hetzner
y rebuild manager con `/embed/*` (repo EXPERIENCEBT-app).

## No tocar
Cutover panel DNS a Nest; demo./apex/admin cutover; apagar Flask registros.
