# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-05
- **Rama:** main

## 3 líneas
Accesos FICTI: variables de control completas (códigos, dispositivo, latencia, cooldown, blacklist, horarios) + hot-path QR más rápido.
Deploy DO OK; smoke ENTRY/EXIT/reentry + p50 server ~2–5 ms.

## Hecho
- API TS: `codigo` reject/success, `dispositivo`, `serverMs`/`client_ms`, cooldown 1.2s, lista negra `accesos_bloqueos`, ventanas `hora_inicio/fin`, aforo atómico, `OK_REENTRY`.
- Endpoints: `/metricas`, `/bloqueos`, PATCH latencia; reportes filtran codigo/dispositivo/origen + export.
- UI panel + PDA: estación persistida, latencia cliente/server, optimistic UI, HID sin debounce, cámara 90ms + jsQR Safari.
- Perf: SELECT mínimo, sin gzip en `/escanear`, pool warm, rate scan 180/min.
- Deploy DO: `eventos_accesos_api` + panel + demo rebuild.

## Latency DO (NOT_FOUND bench in-container)
- Antes: rtt p50≈15 ms / p95≈21 ms (sin `serverMs`).
- Después: rtt p50≈9 ms / p95≈20 ms; **server p50≈2 ms / p95≈5 ms**.
- Happy path real: EXIT ~8 ms server, REENTRY ~13 ms server.

## Smoke DO
- anon scan → 401
- NOT_FOUND + COOLDOWN OK
- ENTRY → ALREADY_INSIDE → EXIT → OK_REENTRY → EXIT restore
- zonas aforo live

## A medias / residual
- UI lista negra (API lista; panel aún sin pantalla CRUD bloqueos).
- Ventanas horarias: columnas + enforce; UI zonas no edita aún hora_inicio/fin.
- Primer ENTRY en frío ~50–60 ms server (más queries que NOT_FOUND).

## No tocar
Terror Hetzner; cutover DNS; secretos en git.
