# La Gala Elisa Carrillo: evento terminado, código heredado

**Resumen:** este repositorio se llama `EVENTO-ELISA-app` por un evento que ya
pasó y que no volverá. Lo que se mantiene vivo hoy es **FICTI · Tech Capital
Puebla 2026**. Todo lo que lleva "Elisa" en el nombre es herencia: sigue
compilando y desplegándose, pero no tiene usuarios ni razón de existir.

Documento escrito el **2026-08-27** con datos verificados en producción.

---

## Qué era

"Gala Elisa y Amigos 2026 con orquesta en vivo": un evento distinto, con su
propio registro, su propio boleto y su propia identidad visual (magenta
`#e33878` y dorado `#f4d142`, nada que ver con el rosa y el verde de FICTI).

El sistema de registro se construyó primero para esa gala. Cuando llegó FICTI
se reutilizó el mismo código en vez de empezar de cero, y el nombre del repo se
quedó como estaba.

## Por qué se puede afirmar que está muerto

Verificado el 2026-08-27 contra las bases del droplet `147.182.128.128`:

| Base | Tabla | Filas |
|---|---|---|
| `bd_demo` (contenedor `eventos_demo_db`, la que sirve el sitio vivo) | `Registro_elisaCarrillo` | **0** |
| `bd_pruebas` (contenedor `postgres_registro_db`, la vieja) | `Registro_elisaCarrillo` | **2** |

Cero registros en la base que está en uso. Las 2 filas de la base vieja son
restos de prueba. En el mismo momento, `Registro_Empresarios` tenía 196 filas y
`Registro_Alumnos` 102, ambas con altas de ese mismo día: FICTI está vivo y
Elisa no.

Además, la ruta `/eventoelisa` **no está enlazada desde ningún sitio del front**.
El home solo ofrece Empresa y Estudiante. Solo se llega escribiendo la URL a
mano.

## Dónde vive el código (inventario completo)

Si algún día se decide retirarlo, esto es todo lo que hay que tocar. Está aquí
para que nadie tenga que volver a rastrearlo.

**`backend/app.py`**

| Línea aprox. | Qué es |
|---|---|
| 34 | `HEX_ELISA_MAGENTA` — el magenta propio del evento |
| 111-122 | Modelo `eventlisa` → tabla `Registro_elisaCarrillo` |
| 265-270 | Rama de `acento_hex()` que evita que herede el verde de estudiantes |
| 407-533 | `crear_pdf_gafete_elisa()` — boleto propio, con cartel a 7 cm |
| 804-805, 822-823 | Rama de `enviar_correo_gafete()` con su asunto propio |
| 911 | Ruta `/eventoelisa` en la lista del SPA |
| 940-995 | `POST /registro_eventlisa` y sus páginas de respuesta |
| 1213 | `tipo_tag = "ELISA_CARRILLO"` en `confirmar_email_generico` |
| 1267-1277 | Reconocimiento del prefijo `ELISA_CARRILLO-` en el escáner |

**Front (`web/src/`)**

- `pages/EventoElisaPage.tsx` — el formulario.
- `styles/elisa.module.scss` — su tema magenta/dorado.
- `styles/_tokens.scss` — bloque `// Legacy Elisa theme tokens`.
- `App.tsx` — la ruta `/eventoelisa`.

**Panel (`panel/`)**

- `consultas.py` — entrada `"elisa"` del `CATALOGO` y el rol `interno`, que es
  el único que la ve (el promotor no).
- `exportar.py` — su hoja en el Excel.
- `seed.py`, `docker-compose.panel.yml` — menciones en comentarios y roles.

## Qué se hizo con él en el rediseño de 2026-08-27

Al pasar todo a tema oscuro, la Gala **se dejó fuera a propósito**:

- `crear_pdf_gafete_elisa()` no se tocó: conserva su diseño.
- En los correos, `acento_hex("ELISA_CARRILLO")` devuelve su magenta y no el
  verde de estudiantes. Sin esa rama, un correo de la Gala habría salido con la
  identidad de FICTI.

Es decir: hoy convive sin estorbar, pero cada cambio de diseño obliga a
acordarse de él.

## Recomendación

**Retirarlo, pero no ahora.** FICTI está en producción con registros entrando a
diario; tocar rutas y modelos compartidos mientras la gente se registra no
compensa.

Cuando FICTI cierre, el orden sensato es:

1. Exportar `Registro_elisaCarrillo` a Excel desde el panel y archivarlo, aunque
   estén casi vacías. Es el único dato que existe del evento.
2. Quitar front y panel primero (`EventoElisaPage.tsx`, `elisa.module.scss`, la
   ruta, la entrada del `CATALOGO`). No tienen dependencias.
3. Después el backend: ruta, modelo y generador de PDF.
4. El prefijo `ELISA_CARRILLO-` en el escáner **se quita al final**, y solo si
   se confirma que no queda ningún boleto impreso en circulación. Es lo único
   que podría dejar a alguien fuera de una puerta.
5. La tabla en la base se borra al final de todo, si acaso.

Y renombrar el repositorio a algo que diga la verdad — `REGISTRO-EVENTOS-app` o
similar — porque hoy `EVENTO-ELISA-app` describe la parte muerta y no la viva.

## Contexto relacionado

- `.ai/RELEVO.md` — estado vivo del proyecto y mapa de dominios.
- El panel y la base los comparten los tres eventos; ver
  `panel/consultas.py`, cuyo `CATALOGO` es la única fuente de nombres de
  columna.
