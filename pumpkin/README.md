# PUMPKIN Accesos

Control de acceso de los 250 pases QR genéricos de PUMPKIN (`QR-001` … `QR-250`), con la misma
mecánica de puerta que FICTI: **entrada, salida y reingreso**, estado dentro/fuera por jornada,
pausa de confirmación, cámara, lector de PDA y cola sin red. Base de datos propia: no comparte
nada con la de FICTI.

- **URL:** https://panel.experiencebt.com.mx (desde el 29-10-2026 todo el dominio es de PUMPKIN:
  la raíz, `/login` y las rutas viejas de FICTI redirigen a `/pumpkin/`). nginx compartido,
  `panel/deploy/zz-panel.conf`. FICTI sigue corriendo sin ruta pública; para volver a publicarlo,
  ver el encabezado de `panel/deploy/zz-panel.ficti.conf`.
- **Servidor:** droplet `147.182.128.128`, `/opt/pumpkin-accesos`, contenedores
  `pumpkin_accesos_web` (API Hono + SPA React, puerto 3090) y `pumpkin_accesos_db` (Postgres 16).
- **Credenciales:** `C:\dev\secrets\pumpkin-accesos\` (PDF, Excel, TXT). Nunca en git: este repo es público.

## Perfiles

| Rol | Cuentas | Puede |
|---|---|---|
| `admin` | `admin` | Resumen en vivo, pases (titular, bloqueo), historial + CSV y escáner |
| `puerta` | `puerta1`–`puerta6` | Solo el escáner (pantalla enfocada, sin menú) |

Las cuentas salen de `PUMPKIN_USUARIOS` en el `.env` del servidor (`usuario:clave:rol:Nombre;…`);
quien no esté queda desactivado. Cada PDA tiene además un **enlace de acceso directo**
(`/pumpkin/directo#usuario.token`, token HMAC derivado de la clave: cambiar la clave lo anula).
`docker exec pumpkin_accesos_web node dist/enlaces.js` los lista (directo a la carpeta de secretos).

## Reglas de puerta (`api/src/scan.ts`)

- ENTRADA: primera de la jornada → `OK_ENTRY`; tras una salida → `OK_REENTRY`; ya dentro → `ALREADY_INSIDE`.
- SALIDA: dentro → `OK_EXIT`; si no → `NOT_INSIDE`.
- Bloqueado → `BLACKLISTED`; fuera del lote → `NOT_FOUND`; basura → `INVALID_QR`; mismo QR+modo en
  < 1.2 s → `COOLDOWN`. Con `PUMPKIN_AFORO` > 0, `ZONE_FULL`.
- La **jornada** cambia a las `PUMPKIN_CORTE_HORA` (6:00 CDMX): una noche cuenta como un día.
- El pase se bloquea con `SELECT … FOR UPDATE`: dos PDA con el mismo pase se validan en orden.
- El lector acepta `QR-045`, `QR'045` (teclado español), `045`, `45` o una URL que lo contenga.

## Desarrollo y despliegue

```
cd pumpkin/api && npm ci && npm test && npm run build
cd pumpkin/ui  && npm ci && npm run build
```

Despliegue: subir `pumpkin/` (sin `node_modules`/`dist`) a `/opt/pumpkin-accesos` y
`docker compose -f docker-compose.pumpkin.yml --env-file .env up -d --build`.

`herramientas/generar_qrs.py` genera el PDF de impresión con los 250 QR reales (5 hojas A4 de 5 × 10).
La plantilla que mandó el cliente traía el mismo dibujo de QR en las 250 celdas y no es legible.
