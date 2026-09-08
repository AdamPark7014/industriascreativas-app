# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-08
- **Rama:** main

## 3 líneas
Cambios del cliente («Cambios Industrias Creativas.pdf»): pop-up de área de
interés, campo Edad en los dos registros, áreas de interés partidas por marca,
institución del estudiante rehecha (tipo + carrera + competencia) y gafete con
los datos que pidieron. Desplegado en DigitalOcean y verificado de punta a punta
con registros reales, ya borrados. 262 alumnos / 507 empresarios intactos.

## Hecho

### Formulario público (`web/`)
- **Pop-up de portada** (`components/AreaInteresGate.tsx`): bloquea de verdad
  — overlay, foco atrapado y `Escape` desactivado — hasta elegir entre las dos
  opciones. La respuesta se guarda en `localStorage` (`lib/areaInteres.ts`) en
  cuanto se contesta, no al enviar: el cliente quiere segmentar a todo el que
  entra, y la mayoría no llega a registrarse. Viaja después con los dos
  formularios como `area_interes_general`.
- **Edad** en empresarios y estudiantes, 7 rangos, mismos en los dos para
  poder cruzarlos.
- **Áreas de interés partidas por marca**: FICTI (16 opciones) y Tech Capital
  (6). Se guardan en un solo arreglo porque los valores no se repiten entre
  bloques. Las píldoras llevan el nombre en texto y no el PNG: los logotipos
  blancos traen ~87 % de aire y dentro de la píldora quedaban ilegibles.
- **Institución del estudiante** rehecha: tipo (Preparatoria/Universidad),
  carrera **condicional** a Universidad, y competencia múltiple con «Ninguna»
  excluyente (el mock dibuja casillas y se puede entrar a Sumobots y Hackathon).

### Backend (`backend/app.py`)
- Columnas nuevas, todas nullable y con `ADD COLUMN IF NOT EXISTS`:
  `Registro_Alumnos` → `Edad`, `TipoInstitucion`, `Carrera`, `Competencia`,
  `AreaInteresGeneral`; `Registro_Empresarios` → `Edad`, `AreaInteresGeneral`.
- `InstitucionEducativa` y `Grado` se siguen alimentando (tipo y carrera) para
  no romper listados, rankings ni export del panel.
- **Gafete**: `crear_pdf_gafete` pasa de `empresa`/`cargo` a una lista
  `detalles`, y `detalles_gafete()` la arma por tipo — empresario: empresa +
  puesto; estudiante: institución (+ carrera) + competencia, ocultando
  «Ninguna». Cada línea encoge si no cabe.

### Dos bugs encontrados de paso
1. **El gafete del empresario nunca mostró el puesto.** Leía `Cargo`, pero el
   formulario público manda `posicion_empresa` → columna `PosicionEmpresa`.
   `Cargo` estaba siempre vacío. Ahora lee `PosicionEmpresa` y cae a `Cargo`
   solo para registros viejos.
2. **Las migraciones de `ensure_schema()` nunca corrían en producción.** Solo
   se llamaba bajo `if __name__ == '__main__'`, y el contenedor arranca
   gunicorn. `deploy/entrypoint.sh` tenía **su propia lista de ALTER**,
   duplicada y ya desincronizada. Unificado: el entrypoint ahora llama a
   `ensure_schema()`, y las tres columnas que solo vivían ahí se movieron
   dentro. Sin esto, las columnas nuevas no se habrían creado — de hecho el
   primer despliegue las dejó fuera.

### Panel (`panel/`)
Etiquetas al día con el modelo nuevo: «Institución educativa» → «Tipo de
institución», «Grado» → «Carrera» (también en export y en la tarjeta del
dashboard). Agregados como columnas visibles `Edad`, `Competencia` y «Área que
quiso explorar».

### Despliegue (`C:\dev\scripts\registro-deploy\deploy_demo_getzy.py`)
- Ahora también sube `panel/` y reconstruye `eventos_panel_web`: los cambios
  tocan las dos caras y desplegar solo el formulario dejaba los datos ciegos.
- El panel se construye con `docker build` directo, **no** `compose build`: su
  compose declara también `accesos_api`, cuya `SCAN_API_KEY` no está en
  `panel/.env`, y compose interpola todos los servicios aunque construyas uno
  solo. Se recrea con `--no-deps panel_web` para que `accesos_api` conserve su
  llave real (verificado: siguió con 41 h de uptime y la llave intacta).

## Verificado en producción (2026-09-07)
- Respaldo antes de tocar nada: `bd_demo-20260907-132005.{dump,sql}` en el
  droplet y en `C:\Users\adpoz\backups\registro-demo\`.
- Las 7 columnas creadas; log del contenedor: «DB tables ready + columns migrated».
- Registro de prueba **estudiante**: edad, tipo, carrera, «Sumobots, Hackathon»
  y área del pop-up guardados correctamente, con las columnas legacy espejadas.
- Registro de prueba **empresario**: edad, puesto, las dos marcas en
  `ProductosInteres` y área del pop-up. Ambas filas de prueba **borradas**;
  conteo de vuelta en 262 / 507.
- Gafete generado sin errores en los tres casos (empresario, universitario con
  competencia, preparatoriano sin ella).
- `demo.` 200, `panel.` 302, `accesos_api` intacto.

## A medias / pendiente de decisión

- **El gafete del estudiante dice el tipo de institución, no el nombre.** El
  PDF pide «INSTITUCIÓN» pero el formulario nuevo ya no captura el nombre de la
  escuela — lo sustituyó por Preparatoria/Universidad. Hoy imprime
  «Universidad · Carrera». Si el cliente quería el nombre del plantel, hay que
  volver a pedir ese campo; conviene confirmarlo antes del evento.
- El ranking del panel que antes agrupaba «Grado escolar» ahora agrupa
  carreras. La etiqueta ya está corregida, pero los registros viejos siguen
  teniendo grados («5º SEMESTRE») mezclados con carreras nuevas.
- `AREAS_RESPONSABILIDAD` y `POSICIONES_EMPRESA` siguen como estaban; el PDF no
  los tocó.

## No tocar
- Terror / Hetzner: otro repo (`EXPERIENCEBT-app`), otro servidor.
- `eventos_accesos_api`: su `SCAN_API_KEY` no está en `panel/.env`. No lo
  recrees con compose sin conocer el valor real.
- Secretos en git. La contraseña de root del droplet viaja solo como
  `REGISTRO_SSH_PASSWORD` en el entorno del comando.

---

# Turno claude-code — 2026-09-08 (respuestas del pop-up en el panel)

## 3 líneas
El cliente pidió ver en el panel las respuestas del pop-up de portada y quién
las dio. El dato ya se guardaba desde el 07-09; lo que faltaba era mostrarlo:
la columna estaba marcada como no visible y no había desglose en el tablero.

## Hecho
- `panel/consultas.py`: `AreaInteresGeneral` pasa de `False` a `True` en los dos
  catálogos, y se renombra a «Área de interés (pop-up)». Con eso la respuesta
  aparece en el listado **junto al nombre**, que es el «quién lo hizo».
- Nueva `_ranking_union(con, columna, tablas)`: suma la misma columna sobre
  varias tablas. Hacía falta porque el pop-up se le muestra a todo el que entra,
  sea estudiante o empresario; contarlo por tabla partía la respuesta en dos
  mitades que nadie sabría volver a juntar. Respeta el alcance del usuario: solo
  suma las tablas que tenga permitidas.
- Tarjeta «Área de interés (pop-up)» en el tablero + su `dibujarBarras`.
- Como está en `campos`, entra también en el export de Excel.

## Verificado en producción (2026-09-08)
- `/api/resumen` devuelve `areainteres`: 53 impresión · 10 turismo · 769 sin
  responder (los 769 son registros anteriores a que existiera la pregunta).
- La columna aparece en el listado de empresas y de estudiantes.
- Emparejamiento nombre↔respuesta comprobado en base.
- Panel sano tras el despliegue; 275 alumnos / 557 empresarios intactos.

## Nota
`demo.` y `panel.` están en **DigitalOcean** (147.182.128.128), no en Hetzner.
La llave `id_ed25519_nexara_hetzner` no abre ese droplet: va por contraseña.

## Pendiente
Quien contesta el pop-up y **no se registra** no queda en ningún lado: la
respuesta viaja con el formulario. Si el cliente quiere medir a todo el que
entra —incluido el que se va sin registrarse— hace falta un endpoint que
guarde la respuesta en cuanto se contesta. Hoy solo se miden los que completan.
