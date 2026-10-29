# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-10-29
- **Rama:** main
- **HEAD:** (ver git log) — **panel.experiencebt.com.mx es de PUMPKIN Accesos** (`pumpkin/`)
  desde el 29-10; el panel de FICTI sigue vivo sin ruta pública (`zz-panel.ficti.conf`).

## 2026-10-29 21:00 UTC · panel.experiencebt.com.mx pasa a PUMPKIN; FICTI aislado (claude-code)

Adam: «mueve ficti de esas urls, ponlo en un contenedor aislado y mete ahí este sistema en las
mismas urls»; confirmó «sí, muévelo» después de saber que el panel de FICTI se usó ese día.
- `panel/deploy/zz-panel.conf`: solo `/pumpkin/` va a `pumpkin_accesos_web`; `/`, `/login`,
  `/logout`, `/accesos*` y todo lo demás redirigen a `/pumpkin/` (`/accesos*` al escáner).
  Recargado con `nginx -s reload` (el inodo ya coincidía tras el reinicio de la mañana).
- FICTI: `eventos_panel_web`, `eventos_accesos_api` y `eventos_demo_db` siguen corriendo y sanos,
  sin ruta pública. **Para volver a publicarlo:** encabezado de `panel/deploy/zz-panel.ficti.conf`
  (respaldo también en `/root/backups/zz-panel.conf.ficti-con-pumpkin-20261029`).
- **demo.experiencebt.com.mx no se tocó**: registro público y enlaces `/boleto/<token>` de los
  correos de FICTI siguen ahí.
- Credenciales (Excel, PDF, TXT) regeneradas con la URL `https://panel.experiencebt.com.mx`.
- Una sesión aparte arregla el `WORKER TIMEOUT` del Excel de FICTI; se le avisó que pruebe por la
  red interna (`http://eventos_panel_web:5000`) y que no toque `zz-panel*.conf`.

## 2026-10-29 · PUMPKIN Accesos: 250 pases QR con la puerta de FICTI (claude-code) — DESPLEGADO

Adam: meter los 250 QR de `Downloads\250-QRS.pdf` en un desarrollo con el control de acceso de
FICTI para PUMPKIN, PDA con acceso directo y ~6 usuarios. Ver `pumpkin/README.md`.
- **El PDF del cliente no sirve para escanear:** las 250 celdas traen el mismo dibujo vectorial y
  no es un QR válido (OpenCV y ZXing no lo leen). Los IDs `QR-001…QR-250` sí están en la base y
  `pumpkin/herramientas/generar_qrs.py` hace el PDF imprimible con QR reales (5 hojas, mismo
  acomodo 5 × 10). Verificado: ZXing 250/250 (también con la hoja entera a 150 dpi) y jsQR 250/250.
  Copia en `Downloads\250-QRS-PUMPKIN-reales.pdf`; `pumpkin/entregables/` está gitignored.
- **Mini app aparte, no dentro del panel de FICTI:** `pumpkin/api` (Hono + pg, scan portado de
  `panel/accesos-api/src/scan.ts`) y `pumpkin/ui` (escáner portado de `panel/ui`: mismo
  `useCameraCapture`, cola sin red, pausa/Siguiente; resumen, pases e historial para supervisión).
  Contenedores `pumpkin_accesos_web` + `pumpkin_accesos_db` en `/opt/pumpkin-accesos`, red
  `interna` + `eventos-demo-net` (solo para que nginx la alcance).
- **Cuentas:** `admin` (supervisión) y `puerta1–6` (solo escáner). Claves, enlaces de acceso
  directo, PDF con tarjetas QR por PDA y Excel en `C:\dev\secrets\pumpkin-accesos\`. El `.env` del
  servidor es copia de `servidor.env`.
- **nginx:** `location ^~ /pumpkin/` en `panel/deploy/zz-panel.conf`. El contenedor
  `nginx_registro_proxy` tenía el archivo «pegado» a un inodo viejo (el host lo reemplazó en sep.):
  escribir con `cat >` no basta, hubo que `docker restart` (antes `nginx -t` en un contenedor
  desechable con los mismos montajes). Respaldo `/root/backups/zz-panel.conf.prev-pumpkin-20261029`.
- Humo contra producción: 27/27 (entrada, duplicado, ya dentro, salida, salida denegada, reingreso,
  QR fuera del lote, basura, dos PDA a la vez, bloqueo, titular, CSV, enlace directo). Después se
  vació `escaneos` y se limpiaron titulares/bloqueos: la base quedó en 250 pases, 0 escaneos.
- **Pendiente de Adam:** (1) si PUMPKIN debe ocupar la raíz de panel.experiencebt.com.mx: el panel
  de FICTI se sigue usando (29-10: resumen hasta 11:15 y un Excel a las 9:40 que falló con
  `WORKER TIMEOUT` en `/api/exportar.xlsx`). (2) **Seguridad:** la contraseña de root que Adam pega
  en el chat está en `.ai/_smoke_accesos.py`, publicado en GitHub (repo público), y sshd acepta
  contraseña para root (2,422 intentos fallidos en 24 h). Apagar `PasswordAuthentication` y rotar.

## 2026-10-19 20:50 · Excel con «Entró al evento», hoja «No asistieron» y sin Elisa (claude-code) — DESPLEGADO

Adam: «que cuando descargue la base me aparezca el estatus de si entró o no al evento; más que
nada dame el Excel» y después «quita el evento de Elisa Carrillo del Excel y pon también quienes no
asistieron». Commits `feat(excel): estatus de entrada al evento por persona` y
`feat(excel): hoja No asistieron y sin Elisa Carrillo`:
- Cada hoja de registros (Empresas, Estudiantes) lleva, justo después de «Asist.», las columnas
  **Entró al evento** (Sí/No con semáforo), **Días que entró** («Día 1, Día 3»), **Primera
  entrada** y **Última salida** (hora de México). Salen de `accesos_escaneos` (solo `ok`,
  `modo='entrada'`/`'salida'`): `consultas.asistencia_por_persona(tipo)` +
  `consultas.CAMPOS_ASISTENCIA`; `exportar._anotar_asistencia` las vuelca al registro y
  `_campos_con_asistencia` las intercala. «Asist.» sigue siendo el contador histórico de la tabla
  de registro (puede diferir si hubo purgas).
- Hoja **No asistieron** (después de «Asistencia»): registrados sin ninguna entrada, con Tipo,
  Folio, Nombre, Empresa/Institución, Correo, Teléfono, Confirmado y fecha de registro (los
  registros anteriores a la migración 001 no tienen fecha). El Resumen suma «Personas que entraron
  al evento» y «Personas que no asistieron», en general y por categoría.
- **Elisa Carrillo fuera del libro completo**: `CATALOGO["elisa"]["en_excel"] = False`;
  `construir` la omite cuando hay más de una tabla (su `/api/exportar/elisa.xlsx` sigue saliendo).
  El panel en pantalla no cambió.
- Cifras del libro del 19-10 20:55: 10,188 registros, **5,303 entraron** (2,685 empresas, 2,618
  estudiantes), **4,885 no asistieron** (2,506 / 2,379; 4,622 de ellos confirmados). Por días: la
  mayoría un solo día, 36 los tres.
- Deploy: `python .ai/_deploy_excel.py subir|excel|promover|rollback` (solo `panel_web`;
  `accesos_api` no se tocó). Rollback: `prev-excel-20261019` = imagen anterior a todo esto,
  `prev-excel2-20261019` = solo con las columnas (sin hoja No asistieron); pasar `ETIQUETA=` al
  script. La fase `excel` genera el libro en un canario de la imagen nueva contra la BD real y lo
  baja a `.ai/exportes/` (gitignored; copia en el servidor en `/root/exportes/`). Panel recreado
  02:58 UTC, healthy, login 200.
- Prueba local sin BD: scratchpad `smoke_excel.py` (stubs de consultas) — sirve de plantilla.
- **Seguridad:** Adam volvió a pegar la contraseña de root en el chat (19-10). No se usó (entró la
  llave `id_ed25519_do_experiencebt_auto`). Sigue pendiente **rotar root**, quitar la línea del
  minero del crontab y, si se puede, apagar PasswordAuthentication.

## 2026-10-16 08:05 · Día 2: mismo QR los 3 días (verificado) y pendiente del minero (claude-code)

- Adam pidió que el QR impreso del gafete sirva los 3 días con control por día. **Ya funciona, sin
  cambios**: `estadoPersona` (scan.ts) solo mira escaneos de HOY (CDMX). Día 1: 2,246 entradas,
  923 sin salida; simulado para el día 2: su estado de hoy está vacío → ENTRADA aceptada («ya vino:
  día 1»). `/zonas` da 0/2500 y 0/180 el día 2 (`SQL_DENTRO_HOY`). 0 rechazos «YA DENTRO» indebidos.
- **PENDIENTE DESPUÉS DEL EVENTO (Adam decidió esperar):** el crontab de root aún tiene la línea
  `@reboot sleep 2100 && flock … /root/.xmrig/kworker …` del minero del 14-10. El binario ya no
  existe (`/root/.xmrig` no está; cuarentena en `/root/quarantine-xmrig-20261014/`), así que hoy no
  hace nada, pero hay que quitarla, revisar systemd/.bashrc/.profile y rotar la clave de root.
- Salud 15-10 11:00: RAM 2.3 GB libres, disco 61 %, carga 1.4 en 2 núcleos; demo_web tiene ráfagas
  de CPU (registro/boletos), el resto en reposo.

## 2026-10-15 09:27 · Segunda purga de pruebas, antes de abrir puertas (claude-code) — APLICADO

Adam: «purga la db de hoy de los escaneos e impresiones, fueron de pruebas, y un registro de
prueba a mi nombre». Con corte en el momento del inventario (09:26 MX; nada posterior existía)
se borraron 29 escaneos (puerta1 la noche del 14, puerta3 hoy 09:17-09:18; 5 personas), 19
impresiones (14-10 tarde/noche y 15-10 08:00-09:00), el aforo quedó en 0 y las asistencias se
recalcularon (0). Borrado también el registro de prueba «ADAM DEL POZO» (empresa 3457, alta en
sitio de impresion9 a las 09:06) con su alta, su correo enviado y su descarga. Respaldo:
`/root/backups/purga-pruebas-20261015/` (`tablas.dump`, `registro-3457.csv`, correos,
descargas, asistencias). Si hay más pruebas antes de abrir, repetir con el mismo script
(scratchpad `purga2.sh`, cambiando el corte).
10:01: a pedido de Adam se borró solo la impresión de prueba de CLAUDIA LETRAS (empresa 3362, impresion5, 09:59; su registro es real y se queda). Respaldo `impresion-claudia-3362.csv` en la misma carpeta. Desde las 10:01 ya hay impresiones reales (impresion6): no purgar a ciegas.

## 2026-10-15 00:00 · Escáner: duplicados visibles y resultado arriba (claude-code) — DESPLEGADO

Adam: una SALIDA repetida no avisaba (la regla de 10 s del cambio anterior ignoraba el mismo
boleto en silencio) y el resultado quedaba abajo. Ahora (commit `feat(escaner): duplicados
visibles`): la cámara bloquea el QR leído hasta que sale del cuadro (`VACIOS_PARA_LIBERAR`=12
intentos sin verlo); la página solo ignora el doble disparo USB (<1.5 s); un duplicado real va
al servidor y sale en rojo («YA DENTRO» / «SALIDA DENEGADA», ya existían en `scan.ts`). Tarjeta de
resultado primero, sólida verde/roja; «Estación / PDA» en «Ajustes». Probado con Playwright
(USB escritorio y 390 px; cámara falsa y4m: QR quieto 1 lectura, sale y vuelve 2). Deploy:
`python .ai/_deploy_escaner.py` (rollback `:prev-escaner2-20261015`). Ojo: el marcador de
`subir` busca `DOBLE_DISPARO_USB_MS`; si se cambia el código, actualizarlo o el build no corre.

## 2026-10-14 17:30 · Mesa = impresion1…impresion10 e instalador con prueba 62 × 29 (claude-code) — DESPLEGADO

- **Cuentas**: Adam quiere que las 10 de la mesa se llamen impresion1-10. `registro1-5` pasaron a
  `impresion6-10` con la misma clave corta; `seed.py` ahora crea cualquier `impresion<n>` de
  `PANEL_EQUIPO_CLAVES` (como `puerta<n>`) y desactiva lo que no esté en la lista. Producción:
  17 activos, `registro1-5` inactivos, las 17 claves del Excel abren su cuenta. Script:
  `python .ai/_deploy_impresion10.py aplicar|rollback` (imagen `:prev-impresion10-20261014`,
  `panel/.env.antes-impresion10`). Excel y secretos (`ficti-usuarios-2026-10-05.txt`,
  `ficti-claves-cortas-2026-10-14.txt`) actualizados con respaldo `*.antes-impresion10.*`.
- **Instalador de la impresora** (`panel/static/print-bridge.zip`, desplegado; la descarga pública
  coincide por sha256): el agente usa por defecto «62mm x 29mm» (62 × 29) en vez de cinta continua
  62 × 100. Antes la etiqueta de prueba del instalador salía en cinta continua y la QL-800 con
  DK-11209 la rechazaba (luz roja). Los boletos del panel no cambian (mandan tamaño y papel en
  cada trabajo). Zips de la carpeta de entrega actualizados; respaldos en `C:\dev\tmp\ficti-respaldos\`.
  Las laptops que ya imprimen no necesitan reinstalar.
- **Ojo, dos PCs**: Adam escribe desde una **Dell** (por control remoto) y esta sesión corre en su
  **ASUS**. La impresora del evento está en la Dell; aquí solo se reinstaló el agente de la ASUS
  (no arrancaba con Windows; quedó con acceso directo en Inicio). La Dell la instala Adam a mano.

## 2026-10-14 17:00 · Claves cortas para puerta, impresión y registro (claude-code) — APLICADO

Adam pidió claves «de mucho más bajo nivel» para el evento. `puerta1-4`, `impresion1-5` y
`registro1-5` tienen ahora «ficti» + 4 dígitos, distinta por cuenta (generadas al azar,
sin patrones obvios). `admin`, `promotor` y `controladm` no cambian. Login: 8 fallos por
usuario+IP bloquean 15 min. Claves en `C:\dev\secrets\ficti-claves-cortas-2026-10-14.txt`
(también actualizados `ficti-usuarios-2026-10-05.txt` y `ficti-puerta-2026-10-14.txt`, respaldos
`*.antes-claves-cortas.txt`) y en el Excel de usuarios (las dos copias; respaldo
`*.antes-claves-cortas.xlsx`). Servidor: `PANEL_EQUIPO_CLAVES` vía
`SECRETOS_EQUIPO=… python .ai/_deploy_dias.py equipo` + recrear panel_web; verificado: los 15
hashes coinciden; redeploy simulado (recrear panel_web) → el seeder actualizó los 17 sin errores y las 17 claves del Excel abren su cuenta en producción (check_password_hash). **Pendiente: volver a claves largas al terminar el evento (18-10).** El PDF de
usuarios de la carpeta de entrega tiene las claves viejas: usar el Excel.

## 2026-10-14 noche · Escáner sin rebotes, purga de pruebas y correos corregidos (claude-code)

- **Escáner** (commit `feat(escaner)`, desplegado con `python .ai/_deploy_escaner.py`,
  rollback `:prev-escaner-20261014`): la cámara solo acepta un QR leído igual 2 veces
  seguidas (<700 ms); tras cada resultado se detiene 2 s (aceptado) / 3.5 s (rechazo)
  con barra y botón «Siguiente»; el mismo boleto en el mismo modo y zona se ignora
  10 s (cambiar a SALIDA, de zona o «Siguiente» lo vuelve a permitir). Antes rebotaba
  ~10 veces (la cámara releía cada 2 s y la página solo ignoraba 0.9 s). Probado con
  Playwright (USB simulado, API falso): 6/6.
- **Purga de pruebas (Adam, 16:39)**: borrados los 10 escaneos (puerta1) y las 11
  impresiones (impresion3) del 14-10, `accesos_zonas.dentro`=0 y `dentro_fecha`=NULL,
  `asistencias`=0 en las 2 personas que tenían 1. Respaldo en el droplet:
  `/root/backups/purga-pruebas-20261014/` (`tablas.dump` pg_dump -Fc de escaneos,
  impresiones y zonas; `asistencias.csv`). Si Adam vuelve a probar antes del evento,
  repetir la misma purga.
- **Correos mal escritos**: 25 dominios (gmail.con, gamil.com, gmail.com4, icloud.con,
  alm.buap.mc, metropli.edu.mx, …) en 36 registros; todos sin MX o dominios trampa
  (gamil/gmaio/gmaol/outloook se quedan con correo ajeno). 17 ya se habían registrado
  otra vez bien (no se tocan); a los otros **20** se les corrigió el correo y se les
  mandó el boleto (operador `correccion-correo-14oct`, 0 fallas). Original → corregido
  en `/root/backups/correcciones-correo-20261014.csv` (droplet, 600).
- **Reenvío masivo terminado 16:44**: 3,018 boletos aceptados por Brevo, 1 falla
  (`gmail.com4`, ya corregido arriba). Quedan 29 sin confirmar, 28 registrados en la
  última hora (flujo normal).

## 2026-10-14 tarde · Mesa de registro e impresión fusionada (claude-code) — DESPLEGADO

Adam: «fusiona los 10 usuarios de impresión para que ambos puedan buscar registros e
imprimir y llenar registros e imprimir». `registro1-5` e `impresion1-5` conservan cuenta,
clave y alcance, pero los dos roles tienen ahora los mismos permisos (`registrar`,
`buscar`, `reenviar`, `imprimir`) y el nombre «Mesa de registro e impresión»
(`catalog.ts`, espejo `consultas.py`). Cada una arranca donde siempre (registro →
`/registro`, impresión → `/buscar`). `OpsShell`: modo enfocado hasta 2 pantallas, con
pestañas «Registrar» / «Buscar e imprimir» en la barra (en teléfono, fila propia).
Deploy: `python .ai/_deploy_mesas.py subir|canario|promover|rollback`
(`:prev-mesas-20261014`; no toca demo_web). Canario VERDE: las 10 con 4 permisos,
buscar y mis-altas 200, `correo-estado` 403, puerta igual.

## 2026-10-14 tarde · Brevo nuevo, aviso de créditos y reenvío masivo (claude-code) — DESPLEGADO

- **Cuenta Brevo activa = la de Zynora/NEXARA** (llave en `backend/.env` del servidor;
  copia en `backend/.env.brevo-zynora`; la vieja de ExperienceBT en
  `backend/.env.bak-brevo-20261014`, 0 créditos hasta el 29-10). Adam subió el plan a
  **20,000 correos/mes** (19,709 créditos a las 15:50). IP del droplet 147.182.128.128
  autorizada en Brevo (la cuenta bloquea IPs desconocidas: si cambia la IP, 401).
- **experiencebt.com.mx autenticado en esa cuenta** (Adam agregó en GoDaddy el TXT
  `brevo-code:61985bdb…`; los DKIM brevo1/brevo2 y el DMARC ya estaban). Sin eso Brevo
  aceptaba por API y luego tiraba el correo («sender ... is not valid»).
- Cambiar de cuenta: `python .ai/_do_brevo_cuenta.py nueva [remitente] | vieja`.
- **Aviso en el panel** (commit `feat(correo)`): `GET /api/interno/correo-estado` en el
  backend (créditos, fin de plan, remitente validado, envíos/fallas 24 h; cache 2 min) →
  `GET /api/accesos/correo-estado` (informes o mesa) → banner rojo en el inicio si Brevo
  no responde, el remitente no está validado, no hay créditos o quedan < 1,000. El
  correo de confirmación queda en `correo_envios` con motivo `enlace`.
  Deploy: `python .ai/_deploy_alerta.py subir|canario|promover|rollback`
  (`:prev-alerta-20261014`). **Promover recrea demo_web: antes `_do_reenvio_boletos.py detener`.**
- **Reenvío masivo** (`_do_reenvio_boletos.py enviar 0 3`, 3 procesos por `id % 3`,
  operador `reenvio-masivo-14oct`, logs `/tmp/reenvio-boletos-{0,1,2}.log` dentro de
  `eventos_demo_web`, `... estado`). Se cortó una vez para el deploy (≈220 enviados) y se
  relanzó; se puede repetir sin duplicar (solo toma no confirmados).
- El boleto 62 × 29 (DK-11209) sigue en producción (bundle y PDF verificados 15:45).

## 2026-10-14 tarde · «No llega el segundo correo» = Brevo sin créditos (claude-code) — DESPLEGADO

**Causa:** la cuenta de Brevo (plan `sendLimit` del 29-09 al 29-10, ~5,100 envíos)
llegó a **0 créditos el 12-10 a las 21:10 (MX)**. Brevo responde «Email not sent:
Your account has insufficient credits». Desde entonces no sale **ningún** correo
(ni confirmación ni gafete), nadie confirmó (0 de ~1,780 registros del 13 y 14) y el
formulario seguía diciendo «te enviamos un correo». Además el enlace de confirmación
vencía en **1 hora**: quien lo abría después veía «expiró» y nunca recibía el gafete.
Y la puerta rechaza `NO CONFIRMADO`.

Arreglo (commit `fix(correo)`, imágenes `eventos-demo-web` y `eventos-accesos-api`):
- `backend/app.py`: enlace válido 30 días (`CONFIRMACION_MAX_AGE_S`); enlace cortado
  o vencido → página clara (antes JSON o 500); la página de confirmación trae
  **«Descargar mi gafete (PDF)»** (`/boleto/<token>`), también si ya estaba
  confirmado; se hace commit antes de mandar el gafete; si el correo de
  confirmación no sale el formulario responde `MENSAJE_CORREO_NO_SALIO` (manda a la
  mesa); error «Brevo sin créditos» legible en el reenvío del panel.
- `panel/accesos-api/src/index.ts`: registrar una impresión (`POST
  /gafete/:tipo/:id/impresion`) **confirma** a la persona → la puerta la acepta.
- Deploy: `python .ai/_deploy_correo.py subir|canario|promover|rollback`
  (rollback a `:prev-correo-20261014`). Canario VERDE (7/7).

**Pendiente — reenvío masivo** (Adam lo autorizó: «sí reenvía»): bloqueado por
créditos. `python .ai/_do_reenvio_boletos.py simular` → 2,995 candidatos
(1,786 registrados después del corte + 1,209 que nunca confirmaron). Cuando haya
créditos: `python .ai/_do_reenvio_boletos.py enviar` (segundo plano dentro de
`eventos_demo_web`, log `/tmp/reenvio-boletos.log`, `... estado` para ver avance).
Confirma solo a quien Brevo aceptó, se detiene sin créditos y se puede repetir.
Cada registro nuevo gasta 2 créditos (confirmación + gafete): ~1,000 registros/día.

**15:35 · llave de otra cuenta.** Adam pasó la llave de la cuenta Brevo de
Zynora/NEXARA (4,940 créditos; IP del droplet ya autorizada). Esa cuenta **no tiene
validado `myticket@experiencebt.com.mx`**: Brevo acepta por API y luego tira el correo
(«sender ... is not valid»). Se probó con 1 envío, se deshizo (persona vuelta a sin
confirmar, bitácora ok=false) y **volvió la llave vieja**. La nueva quedó en
`backend/.env.brevo-zynora` (servidor, 600). Cambiar: `python .ai/_do_brevo_cuenta.py
nueva [remitente] | vieja`. `_do_reenvio_boletos.py` ahora se niega a mandar si el
remitente no está validado. DNS de experiencebt.com.mx: GoDaddy; correo: Microsoft 365.

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
- Ejemplos (código real del panel) en `C:\dev\tmp\boleto-harness\salida\`.
- Deploy: `python .ai/_deploy_boleto.py subir|canario|promover|rollback` (sube SOLO
  esos 7 archivos; rollback a `:prev-boleto-20261014`). Canario VERDE.
- **Ojo**: con **cinta continua** cargada la QL-800 rechazaría estos trabajos (papel
  precortado ≠ rollo). Si cambian de rollo: volver a `62 × 100` o adaptar el agente
  para largo variable en continua (hoy el driver solo ofrece `62mm` = 62 × 100.1).
- Impresión física real en QL-800 con DK-11209: **probada OK por Adam el 14-10 a las 16:15.**

## 2026-10-14 tarde · Rol puerta (claude-code) — DESPLEGADO

Hasta hoy solo `admin` (interno) podía escanear: el personal de la entrada habría
operado con la cuenta que ve y cambia todo. Ahora hay rol **`puerta`** y usuarios
**`puerta1`–`puerta4`** (Adam: exactamente 4) que solo ven el escáner (modo
enfocado, sin lateral) y marcan **ENTRADA, SALIDA y reingreso** en la zona que elijan.

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
  `panel/.env.antes-equipo-*`). Se crearon 5 por error; `puerta5` se quitó del
  `.env` (respaldo `panel/.env.antes-4puertas-*`) y su fila se borró de
  `panel_usuarios` (nunca escaneó): quedan 17 activos. El `panel_web` vivo aún
  tiene `puerta5` en su entorno de arranque: si se reinicia sin recrearse, el
  seeder lo revive; `docker compose up -d panel_web` (recrear) lo evita.
- **Excel de usuarios**: hoja «Panel FICTI (17)» con puerta1-4 en
  `Documents\FICTI-Entrega-2026-10-14\04-Credenciales-PRIVADO\`. La copia de
  `C:\dev\secrets\` **sigue sin actualizar**: Adam la tiene abierta en Excel desde
  las 10:43 (bloqueada). Al cerrarla, copiar encima la de Entrega (eran idénticas;
  respaldo `experiencebt-usuarios-2026-10-07.antes-puertas.xlsx`). El PDF de
  usuarios no incluye las puertas.
- Deploy: `ETIQUETA=prev-puerta-20261014 python .ai/_deploy_dias.py respaldar`
  → `equipo` → subir → canario → promover. `_deploy_dias.py` ahora sube también
  `panel/seed.py` y acepta `ETIQUETA`. **Rollback** a `:prev-puerta-20261014`
  (`ETIQUETA=prev-puerta-20261014 python .ai/_deploy_dias.py rollback`);
  respaldo `/root/backups/bd_demo-prev-puerta-20261014.dump`. El rollback no
  borra a puerta1-4 de la BD (quedarían sin permisos con el código viejo).
- Ojo: a las 14:39 **otro agente** (sesión madre, impresión 62×29 mm:
  `gafete.ts`, `BoletoPrintModal.tsx`, `boleto-face.css`, `boletoLayout.ts`,
  `boletoRender.ts`, `printAgent.ts`) editaba el mismo checkout sin commitear.
  Se subió y construyó desde un árbol limpio (HEAD + rol puerta). Esa sesión
  desplegó luego lo suyo (20:47 UTC) y lo commiteó en `1a27558`.
- Verificado: canario `_smoke_mesa.py` VERDE y `_smoke_dias.py` VERDE (ahora con
  29 checks de `puerta1`: escanea entrada/salida, latencia, operador; 403 en
  resumen, buscar, registro, mesa, reportes, métricas, impresiones, equipo,
  bloqueos, zonas POST, gafete y ficha; Flask `/` → escáner y 403 en datos;
  login real). Promovido ~20:46 UTC. **Humo en producción** (dentro del
  `panel_web` vivo, imágenes fd36176b/d83cef22): VERDE; puerta1 hace
  OK_ENTRY → ALREADY_INSIDE → OK_EXIT → OK_REENTRY con su propia persona de
  prueba (borrada al final). Por URL pública puerta1-4 entran y caen en
  `/accesos/escanear`; la UI real (vía proxy local de solo lectura) muestra el
  shell enfocado sin `<nav>` ni lateral.
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
