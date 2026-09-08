# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-08
- **Rama:** main

## 3 líneas
Gafete Accesos FICTI pasa de 5×8 in a **62×100 mm cinta continua** (Brother
QL-800). CSS `@page`, PDF Hono y ReportLab alineados. Adam imprime en
`panel.experiencebt.com.mx` — requiere deploy DO.

## Qué dejó el turno anterior y sigue en pie

- Pop-up área de interés, Edad, áreas por marca, institución tipo+carrera+competencia.
- Panel muestra respuestas del pop-up + ranking combinado.
- Accesos API TS/Hono en DO; Flask fuera del path Accesos.
- 275 alumnos / 557 empresarios (conteo del 08-09).

## Hecho en este turno

- **Causa:** `@page 5in 8in` + job remapeado a 29×90 mm con cinta 62 mm → Brother
  rechaza; Chrome 4 páginas + headers/footers.
- `panel/ui/.../boleto-face.css`: `@page { size: 62mm 100mm; margin: 0 }` + cara
  compacta (QR 36 mm).
- `accesos-api/src/gafete.ts` + `panel/gafete_pdf.py`: PDF 62×100.
- Copy UI (Buscar/Hub/Ops/modal): papel **62mm Cinta continua**, pies OFF.
- Docs: `docs/ACCESOS-REACT.md`.

## A medias / siguiente

- Deploy DO (`deploy_demo_getzy.py` o rebuild `panel_web` + `accesos_api`).
- Confirmar en Chrome: 1 hoja, papel «62mm Cinta continua».
- Nombre de plantel en gafete estudiante (decisión cliente).

## No tocar

- Terror / Hetzner (`EXPERIENCEBT-app`).
- Recrear `accesos_api` sin conservar `SCAN_API_KEY` real.
- Secretos en git.
