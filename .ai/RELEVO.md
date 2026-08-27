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

## A medias - CUIDADO

- **Nada desplegado.** El droplet sigue sirviendo el diseño azul claro. Todo lo
  de arriba está solo en local y en `main`.
- **Los correos cargan sus logos desde `https://demo.experiencebt.com.mx/…`.**
  `gabor-logo-footer-white.png` es nuevo y **todavía no existe en el servidor**:
  hasta que se despliegue daría 404 en los correos. Se arregla solo con el
  despliegue, porque el Dockerfile reconstruye `web/dist` desde `web/public`.
- Las capturas headless de Chrome por debajo de ~500 px **recortan** en vez de
  escalar. No fiarse de ellas para revisar móvil; medir en el navegador.
- `crear_pdf_gafete_elisa()` escribe en `backend/gafetes_guardados/` como efecto
  secundario. Viene de antes, pero conviene saberlo al probar en local.

## Siguiente paso

1. Decidir si se despliega a `demo.experiencebt.com.mx`.
2. Si sí: `REGISTRO_SSH_PASSWORD=... python C:\dev\scripts\registro-deploy\deploy_demo_getzy.py`,
   que sube el árbol a `/opt/EVENTOS-app` y reconstruye `eventos_demo_web`.
   Después **mandar un registro de prueba** y abrir el correo en Gmail para
   confirmar que los logos cargan.
3. Añadir `PUBLIC_BASE_URL=https://demo.experiencebt.com.mx` al `backend/.env`
   del droplet. Sin él funciona igual (se deduce del host y de
   `X-Forwarded-Proto`), pero explícito es más seguro.
4. Confirmar con el cliente el verde del **gafete impreso**. Si ya hay material
   impreso en azul, revertir `COLOR_VERDE_FICTI` en `backend/app.py` y
   `$ticket-verde` en `badge.module.scss`; el front puede quedarse verde.

## No tocar

- `backend/.env` del droplet: no está en el repo y no se sube (`SKIP_NAMES`).
- Las filas antiguas sin `FechaRegistro`: son NULL a propósito, no rellenar.
- `registro_staging_*` en el droplet: es el stack TypeScript sin enrutar, ajeno
  a este rediseño.
