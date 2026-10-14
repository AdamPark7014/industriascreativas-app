# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-10-14
- **Rama:** main
- **HEAD:** (ver git log) — Boleto 62 × 29 mm (etiqueta DK-11209) y rol `puerta`. **Desplegado en DO.**

## 2026-10-14 tarde · Boleto 62 × 29 mm (claude-code) — DESPLEGADO

Adam: los boletos que les darán miden 6.2 × 2.9 cm (**etiqueta precortada Brother
DK-11209**, confirmado). El boleto pasa de 80 × 59 girado sobre un corte de 62 × 100
a **62 × 29 sin girar**.

- `panel/ui/src/lib/boletoLayout.ts`: `ETIQUETA` (62 × 29, papel `62mm x 29mm`) y
  `GEO` = **59 × 23 mm**, que es el `PrintableArea` del driver para esa etiqueta
  (medido aquí: 58.9 × 22.9). Con 62 × 29 el agente lo encogía a 49 × 23. QR 21 mm,
  nombre 5.2→2.2 mm hasta 3 líneas, folio 2.1 mm, `nombreAire` 0.14 em para que no
  se corten los acentos de las mayúsculas (pasaba también antes).
- `printAgent.ts` manda `widthMm 62, heightMm 29, mediaName '62mm x 29mm'`. El
  agente de las laptops **no cambia**: `Find-QlContinuous62` toma ese nombre exacto
  del driver y solo gira el PNG si el área imprimible es vertical (aquí no lo es).
  Simulado con el driver real: papel `62mm x 29mm`, sin giro, sale 58.8 × 22.9 mm.
- `boleto-face.css`, `boletoRender.ts` (PNG 697 × 272 px, camino Chrome @page 62 × 29),
  `BoletoPrintModal.tsx` (textos) y `accesos-api/src/gafete.ts` (PDF 62 × 29 con la
  misma cara; `formato` = «62×29 mm (etiqueta DK-11209)»).
- Ejemplos (código real del panel) en `C:\dev	mpoleto-harness\salida\`.
- Deploy: `python .ai/_deploy_boleto.py subir|canario|promover|rollback` (sube SOLO
  esos 7 archivos; rollback a `:prev-boleto-20261014`). Canario VERDE.
- **Ojo**: con **cinta continua** cargada la QL-800 rechazaría estos trabajos (papel
  precortado ≠ rollo). Si cambian de rollo: volver a `62 × 100` o adaptar el agente
  para largo variable en continua (hoy el driver solo ofrece `62mm` = 62 × 100.1).
- Pendiente: impresión física real en una QL-800 con DK-11209 (aquí estaba apagada).

## 2026-10-14 tarde · Rol puerta (claude-code) — DESPLEGADO

Hasta hoy solo `admin` (interno) podía escanear: el personal de la entrada habría
operado con la cuenta que ve y cambia todo. Ahora hay rol **`puerta`** y usuarios
**`puerta1`–`puerta5`** que solo ven el escáner (modo enfocado, sin lateral).

- **API** (`catalog.ts`, `index.ts`): rol `puerta` = permiso `escanear`; alcance
  empresas + estudiantes (sin Elisa). `/escanear`, `/escaneos/:id/latencia`,
  `/zonas` y `/bloqueos` ya no comprueban `alcance === 'interno'` en el cuerpo:
  lo decide `REGLAS`. `/resumen` pasa a `informes|mesa` (la puerta no ve
  números). `/bloqueos` (lista negra, sin UI) pide permiso nuevo `bloquear`,
  solo interno. `puedeOperar` de zonas/métricas/reportes = permiso `escanear`.
- **Flask** (`consultas.py`): `puerta` sin panel de datos, inicio
  `/accesos/escanear`. **`seed.py`** crea cualquier `puerta<n>` de
  `PANEL_EQUIPO_CLAVES` (el número de puertas lo decide el `.env`).
- **UI**: `Inicio` manda a `/escanear` a quien escanea sin resumen; Zonas en el
  menú y su formulario piden `zonas_editar` (antes `escanear`).
- **Claves**: `C:\dev\secrets\ficti-puerta-2026-10-14.txt` (fuera del repo) y
  añadidas a la línea `PANEL_EQUIPO_CLAVES` de `ficti-usuarios-2026-10-05.txt`
  (así un `_deploy_mesa.py prep` no las borra). En el servidor:
  `python .ai/_deploy_dias.py equipo` las fusiona en `panel/.env` (respaldo
  `panel/.env.antes-equipo-*`). **No están aún en el Excel/PDF de usuarios**
  (el Excel estaba abierto en Excel).
- Deploy: `ETIQUETA=prev-puerta-20261014 python .ai/_deploy_dias.py respaldar`
  → `equipo` → subir → canario → promover. `_deploy_dias.py` ahora sube también
  `panel/seed.py` y acepta `ETIQUETA`. **Rollback** a `:prev-puerta-20261014`
  (`ETIQUETA=prev-puerta-20261014 python .ai/_deploy_dias.py rollback`);
  respaldo `/root/backups/bd_demo-prev-puerta-20261014.dump`. El rollback no
  borra a puerta1-5 de la BD (quedarían sin permisos con el código viejo).
- Ojo: a las 14:39 **otro agente** (sesión madre, impresión 62×29 mm:
  `gafete.ts`, `BoletoPrintModal.tsx`, `boleto-face.css`, `boletoLayout.ts`,
  `boletoRender.ts`, `printAgent.ts`) editaba el mismo checkout sin commitear.
  Se subió y construyó desde un árbol limpio (HEAD + rol puerta); **esos
  cambios de impresión NO están desplegados ni commiteados** por este turno.
- Verificado: canario `_smoke_mesa.py` VERDE y `_smoke_dias.py` VERDE (ahora con
  29 checks de `puerta1`: escanea entrada/salida, latencia, operador; 403 en
  resumen, buscar, registro, mesa, reportes, métricas, impresiones, equipo,
  bloqueos, zonas POST, gafete y ficha; Flask `/` → escáner y 403 en datos;
  login real). Promovido ~20:46 UTC; por URL pública puerta1-5 entran y caen en
  `/accesos/escanear`; bundle `index-BxJW92TF.js`.
- El límite de `/escanear` es 180/min **por IP**: si todas las puertas salen por
  la misma red del recinto, comparten ese tope (≈3 escaneos/s en total).

## 2026-10-14 · Evento de tres días + modo enfocado (claude-code) — DESPLEGADO

El evento es **15, 16 y 17 de octubre** (jue/vie/sáb). Adam pidió separar todo por
día, blindar impresión y escaneo, y quitar el lateral a quien solo ve una pantalla.
Detalle técnico en `docs/ACCESOS-REACT.md` → "Evento de varios días".

- **Por día** (`accesos-api/src/evento.ts`, `EVENTO_DIAS` en `panel/.env` del
  servidor): dentro/fuera sale del último escaneo aceptado de HOY; reingreso solo
  dentro del mismo día; el veredicto dice "también vino el día 1". Aforo por día
  (`accesos_zonas.dentro_fecha`, migración `007_dias_evento.sql`). `?dia=` en
  resumen/reportes/métricas/mesa/impresiones. `asistencias` ahora es total de
  entradas (no baja con la salida).
- **Excel**: `/reportes?formato=xlsx` → Resumen por día + una hoja por día +
  Asistentes (1.ª entrada / última salida / accesos por día). El Excel del panel
  Flask trae hoja "Asistencia" (`consultas.asistencia_por_dia`, `exportar.py`).
- **UI**: `DiaSelector` + `useDia` (Resumen, Informes, Mesa), franja de días en
  Resumen, chip del día en cabecera, banner en el escáner, lector USB sin dobles.
  **Modo enfocado**: registro1-5 e impresion1-5 ven barra superior, sin lateral.
- **Impresión**: no se manda el job si Windows dice QL apagada; un reintento si el
  agente no contestó; `watched:timeout` se muestra como "enviado · confirma".
- **Bug previo arreglado**: `codes.ts` pedía `ApellidoMaterno` en
  `Registro_Alumnos` (no existe): **todo escaneo de alumno daba 500** desde que
  existe el API TS. Lo destapó el humo nuevo.
- **Seguridad**: el droplet tenía un minero XMRig (`[kworker/0:2]`, 99 % CPU,
  2.1 GB RAM) desde el 27-09, metido por fuerza bruta SSH. Matado y en cuarentena
  en `/root/quarantine-xmrig-20261014/` (bashrc, profile, crontab, unidades
  systemd y binario). **Adam: cambiar la contraseña de root** (se pegó en el chat
  hoy) y, si puede, `PasswordAuthentication no` (hay 2 llaves ed25519 del 09-09).
- Deploy: `python .ai/_deploy_dias.py respaldar|subir|canario|promover|rollback`.
  Respaldo `/root/backups/bd_demo-prev-20261014.dump`; rollback a `:prev-20261014`.
  Canario: `_smoke_mesa.py` VERDE (36/36) y `_smoke_dias.py` VERDE. Promovido
  17:43 UTC; `panel_web` y `accesos_api` healthy, índices y columna presentes.
- Excel de usuarios (13 del panel + Hetzner) en
  `C:\dev\secrets\experiencebt-usuarios-2026-10-07.xlsx` (fuera del repo).

- **Instalación del agente en otra PC (12:00)**: Adam corrió el instalador en una
  segunda laptop y «comprobar» no decía nada. `agent.ps1` responde `/health` con
  `reachable:false` si Windows no tiene la QL-800, y el panel lo pintaba igual que
  "no instalado". Ahora `printAgent.diagnosticar()` distingue *sin agente* (enlace
  a `127.0.0.1:9631/health` + pasos: Extraer todo, instalador, permiso de red local
  de Chrome) de *sin impresora* (driver/USB), y `PrintBridgeInstall` lo muestra.
  Causa probable en esa laptop: `.cmd` ejecutado desde dentro del ZIP o sin driver
  Brother (en ese caso el instalador abre la web de Brother y **no arranca** el
  agente: `install.ps1` sale con código 2 antes del paso 7).

- **Selector manual de impresora (12:20)**: en una laptop Windows sí mostraba la
  QL-800 pero el agente contestaba `printerListed:false`. El panel ahora enseña
  `printersAll` del `/health` y deja elegir la impresora a mano
  (`localStorage ficti_print_printer` → `?printer=` en /health y `printerName`
  en /print-label; el agente ya lo soportaba). Si la lista viene vacía, el
  agente no pudo ejecutar `Get-Printer`: reiniciarlo con el instalador.

- **Auto-elección de la Brother (12:25)**: en la laptop de Adam la QL-800 estaba
  en Windows con otro nombre; eligiéndola a mano el chip pasó a "lista". Ahora,
  si el agente ve una sola impresora Brother y ninguna se llama QL-800, el
  panel la elige solo. Adam va a instalar Claude Code en esa laptop para
  afinar la impresión in situ (driver: papel 62mm, tipo Monocromo).

### Pendiente / siguiente

- Confirmar con Adam que las fechas son 15-17 oct (si no: `EVENTO_DIAS` en
  `panel/.env` y `docker compose up -d` de panel_web + accesos_api).
- Probar en sitio con la QL-800 real (impresión física) y un lector USB.
- Rotar root del droplet; valorar fail2ban. Zona `acreditacion` quedó con
  `dentro=0, dentro_fecha=2026-10-14` tras el humo (sana).

## 2026-10-07 tarde · Login (cursor) — DESPLEGADO

- Adam reportó "usuario o contraseña incorrectos": el log mostró `impresion3` con clave mal
  tecleada y luego `impresiones3`. El seeder estaba bien (13/13 entran). Ver fallidos:
  `python .ai/_do_mesa_fallidos.py [horas]`.
- `panel/templates/login.html`: botón Ver/Ocultar (clave visible en monoespaciada), aviso de
  Bloq Mayús, ayuda "Distingue mayúsculas… guiones opcionales", conserva el usuario al fallar,
  botón "Entrando…". CSS en `panel/static/css/panel.css` (link con `?v=20261007b`).
- `panel/app.py`: la clave se acepta sin espacios en los extremos y, si son 16 alfanuméricos,
  sin guiones (`_variantes_clave`); mayúsculas siguen contando. Bloqueo por usuario+IP (8) con
  tope de IP holgado (40), porque en el evento todas las mesas comparten IP; avisa cuando quedan ≤3.
- `_deploy_mesa.py` ahora sube también `panel/static/css`. Canario sin fallos; 13/13 + variantes
  (Impresion3, espacios, sin guiones) verificadas por URL pública (`.ai/_do_mesa_logins.py`).
  Prueba local: `python .ai/_test_login_local.py`.

## 2026-10-07 · Pulido de la mesa (cursor) — DESPLEGADO

- Commits `73c7e5b` + `eaea767`. Login neutral (sin usuario real en el placeholder, autocomplete),
  esqueleto de carga y título de pestaña por página, Resumen por rol (KPIs de la mesa con
  `mesa.actividad`, sin tarjetas duplicadas, métricas solo con permiso), registro en dos columnas
  (≥1280 px) con lada en el placeholder, ficha sin correo repetido en eventos Brevo.
- Correos mal escritos: `panel/ui/src/lib/correoSugerido.ts` (dominios conocidos + distancia OSA +
  `.con`→`.com`). Registro sugiere y pide confirmar; la ficha ofrece "Reenviar boleto a {corregido}".
  En la base hay 10 dominios rotos (gmail.con, gamil.com, gmal.com…) → **17 personas sin confirmar**
  que se podrían reenviar en bloque si Adam lo pide. Ojo: Brevo marca gmal.com como entregado.
- Backend: `/api/interno/correo-eventos` lee el JSON crudo de Brevo (el modelo del SDK no trae `date`);
  `/boleto/<token>` inválido devuelve 404.
- Deploy: `python .ai/_deploy_mesa.py subir|canario|promover` (usar `subir`, NO `prep`, para no pisar
  las etiquetas). **Rollback ahora a `:prev-20261007`** (mesa v1) — respaldo
  `/root/backups/bd_demo-prev-20261007.dump`. Canario 36/36; 13/13 logins reales
  (`.ai/_do_mesa_logins.py`), cada rol cae en su pantalla.
- **PDF de usuarios** (fuera del repo): `C:\Users\adpoz\Documents\experiencebt-usuarios-2026-10-07.pdf`
  = 13 del panel FICTI + plataforma, Casa del Terror y demo de `experiencebt-credenciales.md`.
  Regenerar: `python C:\dev\secrets\generar-pdf-usuarios.py`.
- Pendiente: impresión física de la etiqueta 80 mm en la QL; rotar `Terror.2026`, `Demo.2026`,
  PIN 4826, `PanelInterno2026`, `PanelPromotor2026`.

## 2026-10-05 · Mesa de atención (cursor) — DESPLEGADO

- 11 usuarios nuevos (Evy): `registro1`–`5` (alta en sitio + imprimir), `impresion1`–`5`
  (buscar por nombre/correo/teléfono, ficha, reenviar al correo registrado u otro, imprimir),
  `controladm` (todo lo anterior + actividad de la mesa). `promotor` ahora también registra,
  busca, reenvía e imprime. `admin` = "NEXARA · Operación". Tabla de roles en `docs/ACCESOS-REACT.md`.
- Claves: `C:\dev\secrets\ficti-usuarios-2026-10-05.txt` (fuera del repo). En el servidor:
  `PANEL_EQUIPO_CLAVES` en `panel/.env`, `PANEL_INTERNO_KEY` en `.env` raíz y `panel/.env`.
- Etiqueta 80 × 59 mm: QR + nombre grande + folio pequeño.
- Tablas nuevas: `accesos_altas_sitio`, `correo_envios`, `boleto_descargas` (006_mesa_atencion.sql).
- Deploy: `python .ai/_deploy_mesa.py prep|subir|canario|promover|rollback` (gitignored).
  Respaldo previo: `/root/backups/bd_demo-20261005-pre-mesa.dump` + `.env` copiados.
  Rollback: imágenes `:prev-20261005` → `python .ai/_deploy_mesa.py rollback`.
- Verificado: canario 36/36 (`.ai/_smoke_mesa.py`), login real por URL pública con 3 roles.
- Ojo: `panel/.env` tiene `PANEL_NOMBRE` con espacios sin comillas → NO hacer `source` de ese
  archivo (compose lo lee bien). Pendiente: probar impresión física en la QL con la etiqueta 80 mm.

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

## Desplegado 2026-09-09 13:17 UTC

- `python .ai/_deploy_print_fix.py` con llave SSH. Vivo en DO: `index-Ck-27Hjk.js` +
  `index-CFboaEyi.css`, `print-bridge.zip` 43602 bytes (antes 13700, del 08-09 16:58).
  Cero ocurrencias de `29mm` en el bundle. `panel_web` y `accesos_api` healthy.
  Bundle contiene "Imprimir boleto", "Instalar impresora", "Impresora apagada", `printerOnline`.
- **Llave de despliegue nueva:** `~/.ssh/id_ed25519_do_experiencebt_auto` (sin passphrase),
  instalada en `authorized_keys` del droplet. La vieja `id_ed25519_do_experiencebt` **tiene
  passphrase** y por eso nunca sirvió desatendida; además PowerShell la subió con BOM UTF-8,
  que sshd rechaza. `_deploy_print_fix.py` ahora prueba las dos y avisa cuál falla.
  Respaldo de `authorized_keys` en el droplet: `/root/.ssh/authorized_keys.bak.*`.

## Turno 2026-09-09 tarde

- **Impresion arreglada de raiz.** El agente daba "No se imprimio" con el boleto ya
  saliendo: el driver de la QL-800 pausa y reanuda el trabajo mientras lo procesa, y
  `Watch-SpoolJob` leia ese estado compuesto ('Paused, Error, Printing, Retained') como
  rechazo, cancelaba y reintentaba. El log de Windows (PrintService/Operational) mostraba
  evento 307 "Paginas imprimidas: 1" en los dos intentos. Corregido en EXPERIENCEBT-app
  `tools/print-bridge/print-label.ps1` (commit 1a5b96a, agente 0.3.1): Error/Paused CON
  Printing = avance; rechazo solo si se queda quieto 8 s o pide intervencion fisica.
  Instalado en la laptop y reempaquetado en `panel/static/print-bridge.zip`.
- **Base purgada.** Borrados 62 escaneos (57 del 05-09 de pruebas, 5 de hoy) y la unica
  impresion; secuencias reiniciadas en 1. Se conservan zonas (vip, acreditacion) y los
  registros (632 empresarios, 292 alumnos). Respaldo `pg_dump --data-only` en el droplet
  `/root/respaldos-accesos/accesos-pruebas-20260909-145308.sql` y copia local en el
  scratchpad de la sesion.
- **Boleto sin banda roja.** Adam pidio quitar el "EMPRESARIO"/"ESTUDIANTE" grande. Fuera
  en DOM, CSS y PNG; el nombre sube y crece (8 mm max, hasta 4 lineas). El tipo sigue
  legible en el folio.
- **Escaner QR mejor.** `useCameraCapture` reescrito: decodifica el recorte del marco
  (mas pixeles utiles, no lee codigos del fondo) y el cuadro completo cada 4 intentos;
  un intento a la vez sobre requestVideoFrameCallback (antes un setInterval de 90 ms
  apilaba decodificaciones); el lienzo ya no deforma la imagen (antes forzaba 480x480
  sobre un cuadro 4:3); enfoque continuo, linterna y cambio de camara; jsQR alterna
  inversion; si BarcodeDetector falla 5 veces seguidas cae a jsQR; reabre la camara al
  volver de segundo plano.

## A medias / siguiente

- Tras el deploy: imprimir un boleto real → ver badge "Impreso ×1" → "Marcar como no impreso" → badge desaparece.
- **Adam: rotar password root DO.** Lo pegó en el chat el 09-09 y además está en claro dentro de
  `.ai/_smoke_accesos.py`, que **sí está trackeado** y commiteado en `6a469dc`.
  `.ai/_ssh_do.py` sí está en `.gitignore`. El commit **no está en GitHub todavía**
  (`origin/main` = 413a31d, no desciende de 6a469dc): un `git push` lo publicaría.
  No lo toqué por la regla de credenciales; decide tú entre rotar, purgar historial o ambas.
- Nombre de plantel en gafete estudiante (decisión cliente).

## No tocar

- Terror / Hetzner app code (salvo print-bridge en EXPERIENCEBT-app).
- Recrear `accesos_api` sin `SCAN_API_KEY`.
- Secretos en git / no guardar password DO en repo.
- No `git reset --hard` / `git checkout --` / `git clean` / `git stash drop`.
