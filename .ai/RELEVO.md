# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-27
- **Rama:** main

## Mapa rápido: quién sirve qué

`demo.experiencebt.com.mx` **no vive en el servidor Hetzner** (5.78.215.109,
que es Pumpkin/`app.` y compañía). Vive en el droplet DigitalOcean
`147.182.128.128`:

- `/etc/nginx/conf.d/zz-demo.conf` dentro del contenedor `nginx_registro_proxy`
  → `proxy_pass http://eventos_demo_web:5000`. La copia versionada de ese
  archivo es `deploy/zz-demo.conf`.
- `eventos_demo_web` = imagen `eventos-demo-web:latest`, construida desde
  `/opt/EVENTOS-app` con `docker-compose.demo.yml`. Es el `Dockerfile` de la
  raíz: build de la SPA Vite (`web/`) + Flask (`backend/`) servido por gunicorn.
- Ese `/opt/EVENTOS-app` es este repo (`AdamPark7014/EVENTOS-app`).
- El panel es otro contenedor, `eventos_panel_web` → `panel.experiencebt.com.mx`.
- Script de subida: `C:\dev\scripts\registro-deploy\deploy_demo_getzy.py`
  (paramiko, necesita `REGISTRO_SSH_PASSWORD`).

## Hecho en este turno

1. **Rescate previo (commit `2d25072`).** Había 33 archivos sin commitear del
   turno anterior. Se salvaron antes de tocar nada.
2. **Sincronización (commit `33e8c77`).** `web/src/styles/flow.module.scss`
   estaba **más nuevo en el droplet que en local**: tenía ajustes de espaciado,
   tamaño de mascota y cuadros decorativos que nunca bajaron. Se tomó la
   versión del servidor como verdad y se bajó a local. Ningún otro archivo de
   `web/src` difería (verificado por md5 ignorando CRLF).
3. **Rediseño del front (commit `20231a7`).** Tema oscuro Tech Capital 2026
   según la referencia que aprobó el cliente:
   - `_tokens.scss`: paleta oscura + `@mixin dark-field`.
   - Acento por flujo con custom properties `--accent`. `AppShell` acepta
     `variant="empresa" | "estudiante"` y pinta `.pageEmpresa` / `.pageEstudiante`.
     Todo el formulario lee `var(--accent)`.
   - Home a dos columnas (`.homeLayout`): antetítulo bicolor, "Asistentes" en
     verde, isotipo + mascota; tarjetas delineadas con icono / texto / flecha.
   - **Estudiante pasa de azul `#26b0d5` a verde `#35d95c`.**
   - Assets nuevos en `web/public/`: `gabor-logo-footer-white.png` y
     `tech-capital-mark.png`.
4. **Correos, boleto y confirmación (commit `f8644a7`).** Lo que sale del
   backend seguía en blanco con el botón azul `#33cccc`:
   - `plantilla_correo()`: envoltura oscura **con tablas y estilos en línea**.
     Outlook no entiende flexbox y varios clientes tiran los `<style>`; cada
     `background-color` lleva su `bgcolor` de respaldo.
   - El acento sale del tipo: verde estudiantes, rosa empresas, **magenta la
     Gala Elisa** (evento aparte, no hereda el verde). Sobre el verde el texto
     blanco no contrasta, así que el botón va con texto oscuro.
   - **Los logos de los correos pasan de data URI a https.** Gmail descarta las
     imágenes en data URI. Los sirve el propio Flask desde `web/dist`.
   - `crear_pdf_gafete()`: boleto oscuro con el QR **sobre placa blanca con
     margen** (necesita zona de silencio para los escáneres). El nombre encoge
     si no cabe y la leyenda corta por palabras.
   - Los logos se incrustaban a resolución completa y cada adjunto pesaba
     **2.5 MB → ahora 76 KB** (`imagen_escalada()`).
   - Las cinco páginas de confirmación pasan por `pagina_confirmacion()`.
   - `crear_pdf_gafete_elisa()` **intacto**.

Verificado: `npm run build` y `npm run lint` limpios; navegador a 1280 y a
375 px sin desbordamiento; correos y boleto renderizados; **el QR del boleto
oscuro decodifica** (`ALUMNO-10482`, `EMPRESARIO-2071`).

5. **Escaneo, icono y documentación (commits `825dd9c` y `bcc612c`).**
   - El escáner era lento por diseño, no por la base de datos: cada boleto
     costaba **dos navegaciones completas**, y la segunda volvía a descargar y
     arrancar el SPA entero (281 KB), más un toque manual en "Escanear
     Siguiente". Medido en vivo: **~1037 ms de red por boleto** solo en esas dos
     cargas.
   - Ahora hay `POST /api/escanear` que devuelve JSON y no recarga nada:
     **~176 ms** medidos desde el navegador. La lógica está en
     `procesar_escaneo()`, compartida con el POST de formulario de siempre, que
     sigue vivo para lo que ya apunte ahí.
   - `EscanearPage` **captura Enter en `onKeyDown`**. Dependía de la sumisión
     implícita del formulario y en el sitio desplegado no disparaba: el código
     se quedaba escrito en el campo. Un lector manda las teclas y cierra con
     Enter, así que eso dejaba el escáner inservible.
   - Cerrojo contra doble disparo, `AudioContext` reutilizado, historial de los
     últimos 8 escaneos y tema oscuro. El modo inactivo se vacía en vez de
     atenuarse: a un metro, una opacidad baja se confunde con el activo.
   - Icono de Empresa cambiado a la silueta de la referencia del cliente.
   - `docs/EVENTO-ELISA.md`: la Gala Elisa es un evento terminado (0 filas en la
     base viva) con el inventario de su código y el orden seguro para retirarlo.

## Desplegado

`bcc612c` está **en producción** en `demo.experiencebt.com.mx` desde el
2026-08-27, con `deploy_demo_getzy.py`. Verificado en vivo:

- Home, `/estudiantes`, `/empresarios`, `/escanear` y `/api/health` → 200, todos
  con el tema oscuro.
- Los cinco assets que necesitan el home y los correos → 200, incluidos los
  nuevos `gabor-logo-footer-white.png` y `tech-capital-mark.png`.
- Escaneo probado de punta a punta contra una fila de prueba (987654) que
  **se borró después**: entrada → ✅, segunda entrada → ❌ límite, salida → 🚪.
  Campo limpio y foco devuelto en los tres.
- Datos intactos: 196 empresarios, 102 alumnos, contadores de asistencia a 0.

## Correos: no se envió ninguno

Comprobado a petición de Adam. No salió ni un correo a nadie real durante este
trabajo:

- En local no existe `backend/.env`, así que `BREVO_API_KEY` estaba vacía y la
  guarda `if not BREVO_API_KEY: return False` corta el envío antes de la API.
- El script de vista previa (`vista_correos.py`) **nunca llama** a
  `enviar_correo_confirmacion` ni a `enviar_correo_gafete`: solo a
  `plantilla_correo()`, `pagina_confirmacion()` y `crear_pdf_gafete()`.
- En el droplet solo se hicieron lecturas y `SELECT`.
- La última alta real fue a las **08:23** hora de México y la primera conexión
  al droplet a las **08:46**. Los correos de esos registros los mandó la app
  sola, funcionando con normalidad.

## A medias - CUIDADO

- **Ya está desplegado y verificado en vivo** (2026-08-27, commit `bcc612c`).
  No queda nada a medias de este trabajo.
- **`demo.` no es un juguete: tiene usuarios reales.** El día del despliegue
  había 196 empresarios y 102 alumnos registrados, con altas de esa misma
  mañana. Cualquier cambio aquí es producción. Antes de desplegar se hizo copia
  de la base en `/root/db-backups/bd_demo_pre_oscuro_20260827_1522.sql.gz`.
- Las capturas headless de Chrome por debajo de ~500 px **recortan** en vez de
  escalar. No fiarse de ellas para revisar móvil; medir en el navegador.
- El automatizador del navegador **no dispara el Enter** de forma que React lo
  vea. Para probar el escáner hay que despachar el evento a mano:
  `inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`.
  Así se descubrió que la sumisión implícita del formulario no funcionaba.
- `crear_pdf_gafete_elisa()` escribe en `backend/gafetes_guardados/` como efecto
  secundario. Viene de antes, pero conviene saberlo al probar en local.

## Siguiente paso

1. Nada urgente. Conviene **mandar un registro de prueba real** y abrir el
   correo en Gmail para confirmar de visu que los logos cargan (las URLs ya
   devuelven 200, pero eso no prueba cómo lo pinta Gmail).
2. Añadir `PUBLIC_BASE_URL=https://demo.experiencebt.com.mx` al `backend/.env`
   del droplet. Hoy funciona sin él (se deduce del host y de
   `X-Forwarded-Proto`), pero explícito es más seguro.
3. Confirmar con el cliente el verde del **gafete impreso**. Si ya hay material
   impreso en azul, revertir `COLOR_VERDE_FICTI` en `backend/app.py` y
   `$ticket-verde` en `badge.module.scss`; el front puede quedarse verde.
4. Retirar la Gala Elisa cuando FICTI cierre. Plan completo y orden seguro en
   `docs/EVENTO-ELISA.md`.

## No tocar

- `backend/.env` del droplet: no está en el repo y no se sube (`SKIP_NAMES`).
  Ahí vive la API key de Brevo.
- El prefijo `ELISA_CARRILLO-` del escáner: es lo último que se retira, y solo
  si se confirma que no queda ningún boleto impreso en circulación.
- Las filas antiguas sin `FechaRegistro`: son NULL a propósito, no rellenar.
- `registro_staging_*` en el droplet: es el stack TypeScript sin enrutar, ajeno
  a este trabajo.
