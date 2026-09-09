# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-08
- **Rama:** main
- **HEAD:** (ver git log) — Accesos: botón único Imprimir boleto, instalador sin Node, registro de impresiones en BD, boleto rediseñado para rollo negro/rojo

## 3 líneas
La QL-800 rechazaba todo porque el rollo es **negro/rojo (DK-2251)** y el driver
mandaba monocromo; el agente local (EXPERIENCEBT-app `tools/print-bridge`) ya lo
detecta solo. Panel: un botón **Imprimir boleto**, panel **Instalar impresora en
esta PC**, y cada impresión queda en `accesos_impresiones` con "Marcar como no impreso".

## Qué dejó el turno anterior y sigue en pie

- Pop-up área de interés, Edad, áreas por marca, institución.
- Accesos API TS/Hono en DO (`eventos_accesos_api`).
- 275 alumnos / 557 empresarios (conteo 08-09).

## Hecho en este turno (sin desplegar)

- `panel/accesos-api`: tabla `accesos_impresiones` (en `ensureIndexes` + `005_accesos_impresiones.sql`),
  rutas `POST/GET/DELETE /gafete/:tipo/:id/impresion[es]`, `GET /impresiones`,
  `buscar` y `gafete` devuelven `impresiones` / `ultimaImpresion`. Probado con Postgres 16 en Docker (33 checks).
- `panel/ui`: `printAgent.ts` (fetch loopback, `colorMode`, errores en español), `BoletoPrintModal`
  (botón único + "Más opciones" con Chrome/PDF + "Marcar como no impreso"), `PrintBridgeInstall.tsx`
  (ZIP + 3 pasos + "Ya la instalé, comprobar"), `BuscarPage` (chip de impresora, badge "Impreso ×N",
  registro tras imprimir), `boletoRender.ts` + `BoletoFace` + CSS (boleto 59×94 mm blanco/negro/rojo,
  PNG 300 dpi, preview WYSIWYG). Build OK: `dist/assets/index-DrBTGvVk.js`.
- `docs/ACCESOS-REACT.md` actualizado.
- Boleto real impreso desde el panel en la QL de Adam (EMPRESARIO-12) vía agente; muestra rediseñada impresa centrada.
- 09-09: boleto **apaisado 94×59 mm** (QR izquierda, banda roja con tipo, nombre, empresa, folio; sin
  FICTI/TECH CAPITAL) en `boletoLayout.ts`, `BoletoFace`, `boletoRender.ts` (PNG 1110×697, el agente lo
  gira 90°), preview escalado en el modal; chip y aviso "Impresora apagada o desconectada" cuando
  `/health.printerOnline === false`. Build: `dist/assets/index-Ck-27Hjk.js`. ZIP del agente
  actualizado en `panel/static/print-bridge.zip` (agent.ps1 con `printerOnline`).

## A medias / siguiente

- **Desplegar**: `python .ai/_deploy_print_fix.py` con `DO_ROOT_PASSWORD` en el entorno (copia panel/ui,
  accesos-api, panel/static). Antes, refrescar `panel/static/print-bridge.zip` con el ZIP nuevo de
  EXPERIENCEBT-app `tools/print-bridge/pack.ps1` (instalador sin Node).
- Tras el deploy: imprimir un boleto real → ver badge "Impreso ×1" → "Marcar como no impreso" → badge desaparece.
- Adam: rotar password root DO.
- Nombre de plantel en gafete estudiante (decisión cliente).

## No tocar

- Terror / Hetzner app code (salvo print-bridge en EXPERIENCEBT-app).
- Recrear `accesos_api` sin `SCAN_API_KEY`.
- Secretos en git / no guardar password DO en repo.
- No `git reset --hard` / `git checkout --` / `git clean` / `git stash drop`.
