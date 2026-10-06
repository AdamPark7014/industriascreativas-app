/**
 * Mesa de atención: ficha completa de una persona, alta en sitio y reenvío del
 * boleto digital.
 *
 * El correo y el PDF del boleto digital viven en el backend del formulario
 * (backend/app.py: plantilla, gafete y Brevo). Aquí no se duplican: se le pide
 * por la red interna de Docker con una llave compartida (PANEL_INTERNO_KEY), así
 * el reenvío sale idéntico al correo original.
 */
import { TIPOS, folioDe, nombreDe, type TipoClave } from './catalog.js'
import { query, queryOne, withClient, type Row } from './db.js'

const BACKEND_URL = (process.env.REGISTRO_INTERNO_URL || 'http://eventos_demo_web:5000').replace(/\/$/, '')
const INTERNO_KEY = process.env.PANEL_INTERNO_KEY || ''

if (!INTERNO_KEY) {
  console.warn('WARN: PANEL_INTERNO_KEY vacío — reenvío de boletos y estado de correo deshabilitados')
}

type Clase = 'texto' | 'lista' | 'fecha'
type Campo = [clave: string, etiqueta: string, clase?: Clase]

/** Mismo orden y etiquetas que panel/consultas.py → CATALOGO. */
const CAMPOS: Record<TipoClave, Campo[]> = {
  empresas: [
    ['Nombre', 'Nombre'],
    ['ApellidoPaterno', 'Apellido paterno'],
    ['ApellidoMaterno', 'Apellido materno'],
    ['Empresa', 'Empresa'],
    ['PosicionEmpresa', 'Posición'],
    ['Cargo', 'Cargo'],
    ['AreaResponsabilidad', 'Área de responsabilidad'],
    ['Correo', 'Correo'],
    ['LadaPais', 'Lada'],
    ['Telefono', 'Teléfono'],
    ['Pais', 'País'],
    ['Estado', 'Estado'],
    ['Ciudad', 'Ciudad'],
    ['CodigoPostal', 'C.P.'],
    ['CalleNumero', 'Calle y número'],
    ['SectorIndustria', 'Sector / industria', 'lista'],
    ['NumEmpleados', 'Núm. empleados'],
    ['DecisionesCompra', 'Decisiones de compra'],
    ['Presupuesto', 'Presupuesto'],
    ['TiempoInversion', 'Tiempo de inversión'],
    ['ProductosInteres', 'Áreas de interés', 'lista'],
    ['Edad', 'Edad'],
    ['AreaInteresGeneral', 'Área que quiere explorar'],
    ['FechaRegistro', 'Fecha de registro', 'fecha'],
  ],
  estudiantes: [
    ['Nombre', 'Nombre'],
    ['ApellidoPaterno', 'Apellido paterno'],
    ['TipoInstitucion', 'Tipo de institución'],
    ['Carrera', 'Carrera'],
    ['InstitucionEducativa', 'Institución'],
    ['Grado', 'Grado'],
    ['Edad', 'Edad'],
    ['Competencia', 'Competencia'],
    ['AreaInteresGeneral', 'Área que quiere explorar'],
    ['Correo', 'Correo', 'lista'],
    ['Telefono', 'Teléfono'],
    ['FechaRegistro', 'Fecha de registro', 'fecha'],
  ],
  elisa: [
    ['Nombre', 'Nombre'],
    ['Correo', 'Correo'],
    ['Telefono', 'Teléfono'],
    ['CodigoPostal', 'C.P.'],
    ['FechaRegistro', 'Fecha de registro', 'fecha'],
  ],
}

function iso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString()
  return v ? String(v) : null
}

function valorCampo(v: unknown, clase: Clase | undefined): string | null {
  if (v == null) return null
  if (clase === 'fecha') return iso(v)
  if (Array.isArray(v)) {
    const s = v.map((x) => String(x ?? '').trim()).filter(Boolean).join(', ')
    return s || null
  }
  const s = String(v).trim()
  return s || null
}

export function correoPrincipal(fila: Row): string {
  const c = fila.Correo
  if (Array.isArray(c)) return String(c[0] || '').trim()
  return String(c || '').trim()
}

export async function filaPersona(tipo: TipoClave, id: number): Promise<Row | null> {
  const t = TIPOS[tipo]
  return queryOne(`SELECT * FROM "${t.tabla}" WHERE "${t.id}" = $1`, [id])
}

/** ¿Este operador dio de alta a la persona en sitio? (la mesa de registro solo imprime lo suyo) */
export async function esAltaDe(tipo: TipoClave, id: number, operador: string): Promise<boolean> {
  const r = await queryOne(
    `SELECT 1 AS ok FROM accesos_altas_sitio WHERE tipo = $1 AND registro_id = $2 AND operador = $3`,
    [tipo, id, operador],
  )
  return Boolean(r)
}

export async function fichaPersona(tipo: TipoClave, id: number) {
  const fila = await filaPersona(tipo, id)
  if (!fila) return null
  const t = TIPOS[tipo]

  const [esc, escLista, imp, impLista, correos, desc, alta] = await Promise.all([
    queryOne<{
      entradas: number
      salidas: number
      rechazos: number
      primera: Date | null
      ultimo: Date | null
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE ok AND modo = 'entrada')::int AS entradas,
         COUNT(*) FILTER (WHERE ok AND modo = 'salida')::int AS salidas,
         COUNT(*) FILTER (WHERE NOT ok)::int AS rechazos,
         MIN(creado) FILTER (WHERE ok AND modo = 'entrada') AS primera,
         MAX(creado) AS ultimo
       FROM accesos_escaneos WHERE tipo = $1 AND registro_id = $2`,
      [tipo, id],
    ),
    query(
      `SELECT id, creado, modo, ok, mensaje, zona_clave, operador, dispositivo
       FROM accesos_escaneos WHERE tipo = $1 AND registro_id = $2
       ORDER BY creado DESC LIMIT 30`,
      [tipo, id],
    ),
    queryOne<{ n: number; ultima: Date | null }>(
      `SELECT COUNT(*)::int AS n, MAX(creado) AS ultima
       FROM accesos_impresiones WHERE tipo = $1 AND registro_id = $2`,
      [tipo, id],
    ),
    query(
      `SELECT id, creado, via, impresora, operador, dispositivo
       FROM accesos_impresiones WHERE tipo = $1 AND registro_id = $2
       ORDER BY creado DESC LIMIT 20`,
      [tipo, id],
    ),
    query(
      `SELECT id, creado, correo, motivo, operador, ok, error
       FROM correo_envios WHERE tipo = $1 AND registro_id = $2
       ORDER BY creado DESC LIMIT 30`,
      [tipo, id],
    ).catch(() => [] as Row[]),
    queryOne<{ n: number; ultima: Date | null }>(
      `SELECT COUNT(*)::int AS n, MAX(creado) AS ultima
       FROM boleto_descargas WHERE tipo = $1 AND registro_id = $2`,
      [tipo, id],
    ).catch(() => null),
    queryOne<{ operador: string; creado: Date }>(
      `SELECT operador, creado FROM accesos_altas_sitio WHERE tipo = $1 AND registro_id = $2`,
      [tipo, id],
    ),
  ])

  const asistencias = Number(fila.asistencias || 0)
  return {
    ok: true,
    tipo,
    tipoEtiqueta: t.etiqueta,
    id,
    folio: folioDe(tipo, id),
    nombre: nombreDe(fila),
    correo: correoPrincipal(fila),
    telefono: String(fila.Telefono || ''),
    confirmado: Boolean(fila.confirmado),
    asistencias,
    dentro: asistencias > 0,
    campos: CAMPOS[tipo]
      .map(([clave, etiqueta, clase]) => ({ clave, etiqueta, valor: valorCampo(fila[clave], clase) }))
      .filter((c) => c.valor != null),
    alta: alta ? { operador: alta.operador, creado: iso(alta.creado) } : null,
    escaneos: {
      entradas: esc?.entradas ?? 0,
      salidas: esc?.salidas ?? 0,
      rechazos: esc?.rechazos ?? 0,
      primeraEntrada: iso(esc?.primera),
      ultimo: iso(esc?.ultimo),
      lista: escLista.map((r) => ({ ...r, creado: iso(r.creado) })),
    },
    impresiones: {
      total: imp?.n ?? 0,
      ultima: iso(imp?.ultima),
      lista: impLista.map((r) => ({ ...r, creado: iso(r.creado) })),
    },
    correos: {
      total: correos.filter((r) => r.ok).length,
      lista: correos.map((r) => ({ ...r, creado: iso(r.creado) })),
    },
    descargas: { total: desc?.n ?? 0, ultima: iso(desc?.ultima) },
  }
}

// ---------------------------------------------------------------- alta en sitio

export const RANGOS_EDAD = [
  'Menos de 16 años',
  '16 - 18 años',
  '19 - 24 años',
  '25 - 34 años',
  '35 - 44 años',
  '45 - 54 años',
  '55 años o más',
]
const TIPOS_INSTITUCION = ['Preparatoria', 'Universidad']
const CORREO_RE = /^[\w.+-]+@[\w.-]+\.\w+$/

export function correoValido(c: string): boolean {
  return CORREO_RE.test(c) && c.length <= 150
}

function txt(v: unknown, max: number, mayus = false): string {
  const s = String(v ?? '')
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
  return mayus ? s.toUpperCase() : s
}

function lista(v: unknown, max: number, maxItems = 30): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => txt(x, max))
    .filter(Boolean)
    .slice(0, maxItems)
}

export type AltaError = { ok: false; error: string; mensaje: string; existente?: unknown }
export type AltaOk = {
  ok: true
  tipo: TipoClave
  id: number
  folio: string
  nombre: string
  correo: string
}

function falla(error: string, mensaje: string): AltaError {
  return { ok: false, error, mensaje }
}

/**
 * Alta de quien llega sin registro previo. Pide lo mismo que el formulario
 * público, pero queda confirmada al momento: la persona está frente a la mesa
 * y se lleva su etiqueta impresa, no hay correo que validar.
 */
export async function crearAltaSitio(
  datos: Record<string, unknown>,
  operador: string,
  dispositivo: string | null,
): Promise<AltaOk | AltaError> {
  const tipo = datos.tipo === 'estudiantes' ? 'estudiantes' : datos.tipo === 'empresas' ? 'empresas' : null
  if (!tipo) return falla('tipo', 'Elige si es empresa o estudiante.')

  const correo = txt(datos.correo, 150).toLowerCase()
  if (!correoValido(correo)) return falla('correo', 'Escribe un correo válido.')
  if (tipo === 'estudiantes' && correo.length > 50) {
    return falla('correo', 'El correo de estudiante admite máximo 50 caracteres.')
  }
  const nombre = txt(datos.nombre, 100, true)
  const apellido = txt(datos.apellidoPaterno, 100, true)
  if (!nombre || !apellido) return falla('nombre', 'Nombre y apellido son obligatorios.')
  const edad = txt(datos.edad, 40)
  if (!RANGOS_EDAD.includes(edad)) return falla('edad', 'Selecciona el rango de edad.')
  const lada = txt(datos.lada, 6) || '+52'
  if (!/^\+\d{1,4}$/.test(lada)) return falla('telefono', 'Lada no válida.')
  const telefono = txt(datos.telefono, 20).replace(/\D/g, '')
  if (telefono.length < 7 || telefono.length > 15) {
    return falla('telefono', 'El teléfono debe tener entre 7 y 15 dígitos.')
  }
  const areaGeneral = txt(datos.areaInteresGeneral, 120) || null

  const t = TIPOS[tipo]
  const existente =
    tipo === 'empresas'
      ? await queryOne(`SELECT * FROM "${t.tabla}" WHERE LOWER("Correo") = $1 LIMIT 1`, [correo])
      : await queryOne(
          `SELECT * FROM "${t.tabla}" WHERE EXISTS (SELECT 1 FROM unnest("Correo") c WHERE LOWER(c) = $1) LIMIT 1`,
          [correo],
        )
  if (existente) {
    const idExistente = Number(existente[t.id])
    return {
      ok: false,
      error: 'ya_registrado',
      mensaje: `Este correo ya está registrado (folio ${folioDe(tipo, idExistente)}). Envía a la persona con la mesa de impresión.`,
      existente: {
        tipo,
        id: idExistente,
        folio: folioDe(tipo, idExistente),
        nombre: nombreDe(existente),
        confirmado: Boolean(existente.confirmado),
      },
    }
  }

  let insertSql: string
  let params: unknown[]
  if (tipo === 'empresas') {
    const empresa = txt(datos.empresa, 150, true)
    const ciudad = txt(datos.ciudad, 100, true)
    const estado = txt(datos.estado, 100, true)
    const posicion = txt(datos.posicionEmpresa, 150)
    const area = txt(datos.areaResponsabilidad, 150)
    const productos = lista(datos.productosInteres, 100)
    const pais = txt(datos.pais, 50, true) || 'MEXICO'
    if (!empresa) return falla('empresa', 'La empresa es obligatoria.')
    if (!ciudad || !estado) return falla('ciudad', 'Ciudad y estado son obligatorios.')
    if (!posicion) return falla('posicion', 'Selecciona la posición en la empresa.')
    if (!area) return falla('area', 'Selecciona el área de responsabilidad.')
    if (!productos.length) return falla('intereses', 'Selecciona al menos un área de interés.')
    insertSql = `INSERT INTO "Registro_Empresarios"
        ("Nombre","ApellidoPaterno","Empresa","LadaPais","Telefono","Pais","CodigoPostal",
         "Ciudad","Estado","Correo","PosicionEmpresa","AreaResponsabilidad","ProductosInteres",
         "Edad","AreaInteresGeneral","confirmado","asistencias")
      VALUES ($1,$2,$3,$4,$5,$6,'00000',$7,$8,$9,$10,$11,$12::varchar[],$13,$14,TRUE,0)
      RETURNING "idEmpresario" AS id`
    params = [
      nombre, apellido, empresa, lada, telefono, pais, ciudad, estado, correo,
      posicion, area, productos, edad, areaGeneral,
    ]
  } else {
    const tipoInst = txt(datos.tipoInstitucion, 40)
    if (!TIPOS_INSTITUCION.includes(tipoInst)) return falla('institucion', 'Selecciona el tipo de institución.')
    const carrera = tipoInst === 'Universidad' ? txt(datos.carrera, 150, true) : ''
    if (tipoInst === 'Universidad' && !carrera) return falla('carrera', 'Escribe la carrera.')
    const competencias = lista(datos.competencias, 40, 5)
    if (!competencias.length) return falla('competencia', 'Indica la competencia o «Ninguna».')
    insertSql = `INSERT INTO "Registro_Alumnos"
        ("Nombre","ApellidoPaterno","Telefono","Correo","InstitucionEducativa","Grado","Edad",
         "TipoInstitucion","Carrera","Competencia","AreaInteresGeneral","confirmado","asistencias")
      VALUES ($1,$2,$3,ARRAY[$4]::varchar[],$5,$6,$7,$8,$9,$10,$11,TRUE,0)
      RETURNING "idAlumno" AS id`
    params = [
      nombre, apellido, `${lada} ${telefono}`.slice(0, 20), correo, tipoInst.toUpperCase(),
      carrera || null, edad, tipoInst, carrera || null, competencias.join(', ').slice(0, 120), areaGeneral,
    ]
  }

  const id = await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      const r = await client.query(insertSql, params)
      const nuevo = Number(r.rows[0].id)
      await client.query(
        `INSERT INTO accesos_altas_sitio (tipo, registro_id, operador, dispositivo) VALUES ($1,$2,$3,$4)`,
        [tipo, nuevo, operador.slice(0, 120), dispositivo],
      )
      await client.query('COMMIT')
      return nuevo
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  })

  return { ok: true, tipo, id, folio: folioDe(tipo, id), nombre: `${nombre} ${apellido}`, correo }
}

/** Quien llega a la mesa sin haber confirmado su correo: el staff lo valida en persona. */
export async function confirmarPersona(tipo: TipoClave, id: number): Promise<boolean> {
  const t = TIPOS[tipo]
  const r = await query(
    `UPDATE "${t.tabla}" SET confirmado = TRUE WHERE "${t.id}" = $1 RETURNING "${t.id}"`,
    [id],
  )
  return r.length > 0
}

// ---------------------------------------------------------------- backend del formulario

type RespInterna = { ok: boolean; error?: string; mensaje?: string; [k: string]: unknown }

async function backendInterno(ruta: string, init: RequestInit = {}): Promise<RespInterna> {
  if (!INTERNO_KEY) return { ok: false, error: 'sin_configurar', mensaje: 'Falta PANEL_INTERNO_KEY en el servidor.' }
  try {
    const res = await fetch(`${BACKEND_URL}${ruta}`, {
      ...init,
      headers: {
        'X-Interno-Key': INTERNO_KEY,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    })
    const body = (await res.json().catch(() => ({}))) as RespInterna
    if (!res.ok && body.ok !== false) return { ok: false, error: `http_${res.status}` }
    return body
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('backend interno', ruta, msg)
    return { ok: false, error: 'backend_no_disponible', mensaje: 'El servicio de correo no respondió.' }
  }
}

/** Manda el boleto digital (mismo correo y PDF que la confirmación original). */
export function enviarBoleto(opts: {
  tipo: TipoClave
  id: number
  correo?: string | null
  motivo: 'reenvio' | 'alta_sitio'
  operador: string
}): Promise<RespInterna> {
  return backendInterno('/api/interno/gafete', {
    method: 'POST',
    body: JSON.stringify(opts),
  })
}

/** Eventos de Brevo (entregado, abierto, clic, rebote) de los correos a esa dirección. */
export function eventosCorreo(correo: string): Promise<RespInterna> {
  return backendInterno(`/api/interno/correo-eventos?correo=${encodeURIComponent(correo)}`)
}
