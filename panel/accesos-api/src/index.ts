import { serve } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { compress } from 'hono/compress'
import ExcelJS from 'exceljs'
import {
  ROLES,
  TIPOS,
  ZONA_DEFECTO,
  folioDe,
  nombreDe,
  puede,
  sesionJson,
  tiposDe,
  type Permiso,
  type TipoClave,
} from './catalog.js'
import { ensureIndexes, pool, query, queryOne, withClient } from './db.js'
import { decodeFlaskSession } from './flaskSession.js'
import { boletoPayload, boletoPdf } from './gafete.js'
import { CODIGOS } from './codes.js'
import { clientIp, origenConfiable, rateOk, safeEq } from './security.js'
import { buscarExacto, buscarTexto, procesarEscaneo } from './scan.js'
import {
  confirmarPersona,
  correoValido,
  crearAltaSitio,
  enviarBoleto,
  esAltaDe,
  eventosCorreo,
  fichaPersona,
  filaPersona,
  correoPrincipal,
} from './personas.js'

const PORT = Number(process.env.PORT || 3080)
const PANEL_SECRET = process.env.PANEL_SECRET_KEY || ''
const SCAN_API_KEY = process.env.SCAN_API_KEY || ''
const PUBLIC_HTTPS = (process.env.PUBLIC_BASE_URL || '').startsWith('https://')

if (!PANEL_SECRET) {
  console.warn('WARN: PANEL_SECRET_KEY empty — panel /api/accesos will 401')
}

type Vars = { usuario: string; nombre: string; alcance: string }

const app = new Hono<{ Variables: Vars }>()
app.use('*', async (c, next) => {
  // Skip gzip on the scan hot path — tiny JSON, compression adds latency.
  if (c.req.path.endsWith('/escanear')) {
    await next()
    return
  }
  return compress()(c, next)
})

app.get('/health', (c) =>
  c.json({ ok: true, stack: 'accesos-ts', cooldownMs: Number(process.env.SCAN_COOLDOWN_MS || 1200) }),
)

function sanitizeDevice(v: unknown): string {
  return String(v || '')
    .trim()
    .slice(0, 60)
    .replace(/[^\w.\-:@ ]+/g, '')
}

function parseClientMs(v: unknown): number | undefined {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 120_000) return undefined
  return Math.round(n)
}

// ---------- short TTL cache for resumen (safe, shared reads) ----------
type CacheEntry = { at: number; body: unknown }
const resumenCache = new Map<string, CacheEntry>()
const RESUMEN_TTL_MS = 2500

function escaneoJson(r: Record<string, unknown>): Record<string, unknown> {
  const creado = r.creado
  return {
    ...r,
    creado:
      creado instanceof Date
        ? creado.toISOString()
        : creado
          ? String(creado)
          : null,
  }
}

// ---------- Impresiones de boletos: helpers (rutas más abajo, sección "Impresiones") ----------
const IMPRESION_VIAS = new Set(['ql', 'chrome', 'pdf', 'test'])
const IMPRESION_MODOS_COLOR = new Set(['mono', 'redblack'])
const IMPRESIONES_POR_PERSONA = 50

type ImpresionRow = {
  id: number
  creado: Date | string
  tipo: string
  registro_id: number
  folio: string
  via: string
  impresora: string | null
  modo_color: string | null
  job_id: number | null
  operador: string | null
  dispositivo: string | null
}

type ConteoImpresion = { impresiones: number; ultimaImpresion: string | null }
const SIN_IMPRESIONES: ConteoImpresion = { impresiones: 0, ultimaImpresion: null }

const IMPRESION_COLS =
  'id, creado, tipo, registro_id, folio, via, impresora, modo_color, job_id, operador, dispositivo'

function isoDe(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString()
  return v ? String(v) : null
}

function impresionJson(r: ImpresionRow) {
  return {
    id: Number(r.id),
    creado: isoDe(r.creado),
    tipo: r.tipo,
    registroId: Number(r.registro_id),
    folio: r.folio,
    via: r.via,
    impresora: r.impresora ?? null,
    modoColor: r.modo_color ?? null,
    jobId: r.job_id == null ? null : Number(r.job_id),
    operador: r.operador ?? null,
    dispositivo: r.dispositivo ?? null,
  }
}

/** Entero positivo estricto (sin ".pdf", decimales ni signos). null si no es válido. */
function parseEnteroId(s: string | undefined): number | null {
  if (!s || !/^\d{1,9}$/.test(s)) return null
  const n = Number(s)
  return n >= 1 ? n : null
}

/** Texto libre opcional: recorta y quita caracteres de control. null si vacío; undefined si excede max. */
function textoOpcional(v: unknown, max: number): string | null | undefined {
  if (v == null) return null
  const s = String(v)
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .trim()
  if (!s) return null
  if (s.length > max) return undefined
  return s
}

function claveImpresion(tipo: string, id: number): string {
  return `${tipo}:${id}`
}

/** Conteo + última impresión por (tipo, registro_id) para un lote, en UNA consulta agregada. */
async function conteoImpresiones(
  claves: { tipo: string; id: number }[],
): Promise<Map<string, ConteoImpresion>> {
  const out = new Map<string, ConteoImpresion>()
  if (!claves.length) return out
  const params: unknown[] = []
  const pares = claves.map((k) => {
    params.push(k.tipo, k.id)
    return `($${params.length - 1}::text,$${params.length}::int)`
  })
  const rows = await query<{
    tipo: string
    registro_id: number
    n: number
    ultima: Date | string | null
  }>(
    `SELECT tipo, registro_id, COUNT(*)::int AS n, MAX(creado) AS ultima
     FROM accesos_impresiones
     WHERE (tipo, registro_id) IN (${pares.join(',')})
     GROUP BY tipo, registro_id`,
    params,
  )
  for (const r of rows) {
    out.set(claveImpresion(r.tipo, Number(r.registro_id)), {
      impresiones: r.n,
      ultimaImpresion: isoDe(r.ultima),
    })
  }
  return out
}

async function conteoImpresion(tipo: string, id: number): Promise<ConteoImpresion> {
  const m = await conteoImpresiones([{ tipo, id }])
  return m.get(claveImpresion(tipo, id)) ?? SIN_IMPRESIONES
}

// ===================== PANEL /api/accesos/* =====================
const panel = new Hono<{ Variables: Vars }>()
type Ctx = Context<{ Variables: Vars }>

/**
 * Quién entra a cada ruta (ROLES en catalog.ts). Lista vacía = cualquier sesión.
 * Lo que no aparece aquí se niega: una ruta nueva sin regla no queda abierta.
 */
const REGLAS: [metodo: string, ruta: RegExp, permisos: Permiso[]][] = [
  ['GET', /^\/sesion$/, []],
  ['GET', /^\/zonas$/, []],
  ['GET', /^\/resumen$/, ['informes', 'mesa', 'escanear']],
  ['GET', /^\/buscar$/, ['buscar']],
  ['POST', /^\/zonas$/, ['zonas_editar']],
  ['*', /^\/bloqueos$/, ['escanear']],
  ['GET', /^\/metricas$/, ['metricas']],
  ['POST', /^\/escanear$/, ['escanear']],
  ['PATCH', /^\/escaneos\/\d+\/latencia$/, ['escanear']],
  ['GET', /^\/gafete\//, ['imprimir']],
  ['POST', /^\/gafete\//, ['imprimir']],
  ['DELETE', /^\/gafete\//, ['desmarcar']],
  ['GET', /^\/impresiones$/, ['mesa']],
  ['GET', /^\/reportes$/, ['informes']],
  ['POST', /^\/registro$/, ['registrar']],
  ['GET', /^\/mis-altas$/, ['registrar']],
  // La mesa de registro abre solo las fichas de sus altas (se revisa en la ruta).
  ['GET', /^\/persona\/\w+\/\d+$/, ['buscar', 'registrar']],
  ['GET', /^\/persona\/\w+\/\d+\/correo-eventos$/, ['buscar']],
  ['POST', /^\/persona\/\w+\/\d+\/reenviar$/, ['reenviar']],
  ['POST', /^\/persona\/\w+\/\d+\/confirmar$/, ['buscar']],
  ['GET', /^\/mesa$/, ['mesa']],
  ['GET', /^\/equipo$/, ['equipo']],
]

function permitido(rol: string, metodo: string, ruta: string): boolean {
  for (const [m, re, permisos] of REGLAS) {
    if ((m === '*' || m === metodo) && re.test(ruta)) {
      return permisos.length === 0 || permisos.some((p) => puede(rol, p))
    }
  }
  return false
}

panel.use('*', async (c, next) => {
  const cookie = getCookie(c, 'panel_session')
  const sess = decodeFlaskSession(cookie, PANEL_SECRET)
  if (!sess?.usuario) {
    return c.json({ ok: false, error: 'sesion_expirada' }, 401)
  }
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS') {
    if (!origenConfiable(c.req.raw.headers, c.req.header('host'))) {
      return c.json({ ok: false, error: 'csrf_origen' }, 403)
    }
  }
  const ip = clientIp(c.req.raw.headers)
  const kind = c.req.method === 'POST' ? 'mutacion' : 'api'
  const isScan = c.req.path.endsWith('/escanear')
  const max = isScan ? 180 : kind === 'mutacion' ? 40 : 90
  if (!rateOk(`${kind}:${ip}:${isScan ? 'scan' : c.req.path}`, max, 60_000)) {
    return c.json({ ok: false, error: 'rate_limit' }, 429)
  }
  c.set('usuario', String(sess.usuario))
  c.set('nombre', String(sess.nombre || sess.usuario))
  c.set('alcance', String(sess.alcance || 'promotor'))
  c.header('Cache-Control', 'no-store')
  const ruta = c.req.path.replace(/^\/api\/accesos/, '') || '/'
  const metodo = c.req.method === 'HEAD' ? 'GET' : c.req.method
  if (!permitido(c.get('alcance'), metodo, ruta)) {
    return c.json({ ok: false, error: 'sin_permiso', codigo: CODIGOS.SOLO_INTERNO }, 403)
  }
  await next()
})

panel.get('/sesion', (c) =>
  c.json(
    sesionJson({
      usuario: c.get('usuario'),
      nombre: c.get('nombre'),
      alcance: c.get('alcance'),
    }),
  ),
)

panel.get('/resumen', async (c) => {
  const alcance = c.get('alcance')
  const cacheKey = alcance
  const hit = resumenCache.get(cacheKey)
  if (hit && Date.now() - hit.at < RESUMEN_TTL_MS) {
    c.header('X-Cache', 'HIT')
    return c.json(hit.body)
  }

  const tipos = tiposDe(alcance)
  const confirmSql = tipos
    .map((k, i) => `SELECT COUNT(*)::int AS n FROM "${TIPOS[k].tabla}" WHERE "confirmado"`)
    .join(' UNION ALL ')
  const dentroSql = tipos
    .map((k) => `SELECT COALESCE(SUM("asistencias"),0)::int AS n FROM "${TIPOS[k].tabla}"`)
    .join(' UNION ALL ')

  const [confirmRows, dentroRows, hoy, zonas, recientes] = await Promise.all([
    query<{ n: number }>(`SELECT SUM(n)::int AS n FROM (${confirmSql}) s`),
    query<{ n: number }>(`SELECT SUM(n)::int AS n FROM (${dentroSql}) s`),
    queryOne<{
      entradas: number
      salidas: number
      rechazos: number
      total: number
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE ok AND modo = 'entrada')::int AS entradas,
        COUNT(*) FILTER (WHERE ok AND modo = 'salida')::int AS salidas,
        COUNT(*) FILTER (WHERE NOT ok)::int AS rechazos,
        COUNT(*)::int AS total
      FROM accesos_escaneos
      WHERE creado >= date_trunc('day', NOW() AT TIME ZONE 'America/Mexico_City')
            AT TIME ZONE 'America/Mexico_City'
    `),
    query(`SELECT id, clave, nombre, aforo, dentro, activo FROM accesos_zonas ORDER BY id`),
    query(`
      SELECT id, creado, tipo, registro_id, nombre, modo, ok, mensaje, zona_clave
      FROM accesos_escaneos ORDER BY creado DESC LIMIT 12
    `),
  ])

  const body = {
    ...sesionJson({
      usuario: c.get('usuario'),
      nombre: c.get('nombre'),
      alcance,
    }),
    confirmados: confirmRows[0]?.n || 0,
    dentro: dentroRows[0]?.n || 0,
    entradasHoy: hoy?.entradas || 0,
    salidasHoy: hoy?.salidas || 0,
    rechazosHoy: hoy?.rechazos || 0,
    escaneosHoy: hoy?.total || 0,
    zonas,
    recientes: recientes.map(escaneoJson),
  }
  resumenCache.set(cacheKey, { at: Date.now(), body })
  c.header('X-Cache', 'MISS')
  return c.json(body)
})

panel.get('/buscar', async (c) => {
  let q = (c.req.query('q') || '').trim()
  if (q.length > 120) return c.json({ ok: false, error: 'q_larga' }, 400)
  if (q.length < 2) return c.json({ q, results: [] })
  q = q.replace(/%/g, '').replace(/_/g, '')
  const tipoFiltro = c.req.query('tipo') || ''
  const okTipos = tiposDe(c.get('alcance'))
  const tipos =
    tipoFiltro && okTipos.includes(tipoFiltro as TipoClave)
      ? [tipoFiltro as TipoClave]
      : okTipos
  const exact = await buscarExacto(q, tipos)
  const hits = exact.length ? exact : await buscarTexto(q, tipos)
  const results = hits.slice(0, 20)
  // impresiones / ultimaImpresion por resultado: una sola consulta agregada por lote (sin N+1).
  const conteos = await conteoImpresiones(results.map((h) => ({ tipo: h.tipo, id: h.id })))
  return c.json({
    q,
    results: results.map((h) => ({
      ...h,
      ...(conteos.get(claveImpresion(h.tipo, h.id)) ?? SIN_IMPRESIONES),
    })),
  })
})

panel.get('/zonas', async (c) => {
  const zonas = await query(
    `SELECT id, clave, nombre, aforo, dentro, activo, hora_inicio, hora_fin, zona_requerida
     FROM accesos_zonas ORDER BY id`,
  )
  return c.json({
    zonas,
    puedeOperar: c.get('alcance') === 'interno',
  })
})

panel.post('/zonas', async (c) => {
  if (c.get('alcance') !== 'interno') {
    return c.json({ ok: false, error: 'solo_interno', codigo: CODIGOS.SOLO_INTERNO }, 403)
  }
  const datos = await c.req.json().catch(() => ({}))
  const clave = String(datos.clave || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
  const nombre = String(datos.nombre || '').trim()
  let aforo = Number(datos.aforo || 0)
  if (!Number.isFinite(aforo) || aforo < 0) aforo = 0
  aforo = Math.floor(aforo)
  const horaInicio = datos.hora_inicio ? String(datos.hora_inicio).slice(0, 8) : null
  const horaFin = datos.hora_fin ? String(datos.hora_fin).slice(0, 8) : null
  const zonaRequerida = Boolean(datos.zona_requerida)
  if (!clave || !nombre) return c.json({ ok: false, error: 'datos' }, 400)
  await query(
    `INSERT INTO accesos_zonas (clave, nombre, aforo, hora_inicio, hora_fin, zona_requerida)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (clave) DO UPDATE
       SET nombre = EXCLUDED.nombre,
           aforo = EXCLUDED.aforo,
           hora_inicio = EXCLUDED.hora_inicio,
           hora_fin = EXCLUDED.hora_fin,
           zona_requerida = EXCLUDED.zona_requerida,
           activo = TRUE`,
    [clave, nombre, aforo, horaInicio, horaFin, zonaRequerida],
  )
  const zonas = await query(
    `SELECT id, clave, nombre, aforo, dentro, activo, hora_inicio, hora_fin, zona_requerida
     FROM accesos_zonas ORDER BY id`,
  )
  resumenCache.clear()
  return c.json({ ok: true, zonas })
})

panel.get('/bloqueos', async (c) => {
  if (c.get('alcance') !== 'interno') {
    return c.json({ ok: false, error: 'solo_interno', codigo: CODIGOS.SOLO_INTERNO }, 403)
  }
  const rows = await query(
    `SELECT id, tipo, registro_id, motivo, activo, creado
     FROM accesos_bloqueos WHERE activo ORDER BY creado DESC LIMIT 500`,
  )
  return c.json({ bloqueos: rows.map(escaneoJson) })
})

panel.post('/bloqueos', async (c) => {
  if (c.get('alcance') !== 'interno') {
    return c.json({ ok: false, error: 'solo_interno', codigo: CODIGOS.SOLO_INTERNO }, 403)
  }
  const datos = await c.req.json().catch(() => ({}))
  const tipo = String(datos.tipo || '').trim()
  const registroId = Number(datos.registro_id || datos.registroId || 0)
  const motivo = String(datos.motivo || 'Lista negra').trim().slice(0, 160)
  const activo = datos.activo === false ? false : true
  if (!tiposDe('interno').includes(tipo as TipoClave) || !Number.isFinite(registroId) || registroId < 1) {
    return c.json({ ok: false, error: 'datos' }, 400)
  }
  if (activo) {
    await query(
      `INSERT INTO accesos_bloqueos (tipo, registro_id, motivo, activo)
       VALUES ($1,$2,$3,TRUE)
       ON CONFLICT (tipo, registro_id) DO UPDATE
         SET motivo = EXCLUDED.motivo, activo = TRUE`,
      [tipo, registroId, motivo],
    )
  } else {
    await query(
      `UPDATE accesos_bloqueos SET activo = FALSE WHERE tipo = $1 AND registro_id = $2`,
      [tipo, registroId],
    )
  }
  return c.json({ ok: true })
})

panel.get('/metricas', async (c) => {
  const hoy = await queryOne<{
    n: number
    p50: number | null
    p95: number | null
    avg_server: number | null
    avg_client: number | null
  }>(`
    SELECT
      COUNT(*)::int AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY server_ms)::float AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY server_ms)::float AS p95,
      AVG(server_ms)::float AS avg_server,
      AVG(client_ms)::float AS avg_client
    FROM accesos_escaneos
    WHERE creado >= date_trunc('day', NOW() AT TIME ZONE 'America/Mexico_City')
          AT TIME ZONE 'America/Mexico_City'
      AND server_ms IS NOT NULL
  `)
  const devices = await query<{
    dispositivo: string
    n: number
    p50: number | null
    ok_rate: number | null
  }>(`
    SELECT
      COALESCE(NULLIF(dispositivo,''), '(sin etiqueta)') AS dispositivo,
      COUNT(*)::int AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY server_ms)::float AS p50,
      (AVG(CASE WHEN ok THEN 1.0 ELSE 0.0 END))::float AS ok_rate
    FROM accesos_escaneos
    WHERE creado >= date_trunc('day', NOW() AT TIME ZONE 'America/Mexico_City')
          AT TIME ZONE 'America/Mexico_City'
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 40
  `)
  const codigos = await query<{ codigo: string; n: number }>(`
    SELECT COALESCE(codigo,'(sin)') AS codigo, COUNT(*)::int AS n
    FROM accesos_escaneos
    WHERE creado >= date_trunc('day', NOW() AT TIME ZONE 'America/Mexico_City')
          AT TIME ZONE 'America/Mexico_City'
    GROUP BY 1
    ORDER BY n DESC
    LIMIT 30
  `)
  return c.json({
    hoy: hoy || { n: 0, p50: null, p95: null, avg_server: null, avg_client: null },
    devices,
    codigos,
    puedeOperar: c.get('alcance') === 'interno',
  })
})

panel.post('/escanear', async (c) => {
  if (c.get('alcance') !== 'interno') {
    return c.json({ ok: false, error: 'solo_interno', codigo: CODIGOS.SOLO_INTERNO }, 403)
  }
  const startedAt = Date.now()
  const datos = await c.req.json().catch(() => ({}))
  const qr = String(datos.qr || datos.qr_data || '').trim()
  const modo = String(datos.modo || 'entrada').trim().toLowerCase()
  let zonaClave = String(datos.zona || ZONA_DEFECTO).trim().toLowerCase()
  const dispositivo = sanitizeDevice(datos.dispositivo || datos.device || datos.station)
  const clientMs = parseClientMs(datos.clientLatencyMs ?? datos.client_ms)
  if (qr.length > 80) return c.json({ ok: false, error: 'qr_largo', codigo: CODIGOS.INVALID_QR }, 400)
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(qr)) {
    return c.json(
      {
        ok: false,
        codigo: CODIGOS.INVALID_QR,
        mensaje: 'CODIGO INVALIDO',
        detalles: 'El QR no tiene un formato reconocido.',
        pitido: 'error',
        nombre: '',
        tipo: '',
        asistencias: 0,
        dentro: false,
        currentlyInside: false,
        serverMs: Math.max(0, Date.now() - startedAt),
      },
      400,
    )
  }
  if (modo !== 'entrada' && modo !== 'salida') {
    return c.json({ ok: false, error: 'modo' }, 400)
  }
  if (!/^[a-z0-9_-]{1,40}$/.test(zonaClave)) {
    return c.json({ ok: false, error: 'zona', codigo: CODIGOS.ZONE_REQUIRED }, 400)
  }
  if (!qr) {
    return c.json({
      ok: false,
      codigo: CODIGOS.SIN_DATOS,
      mensaje: 'SIN DATOS',
      detalles: 'No se recibió ningún código.',
      pitido: 'error',
      nombre: '',
      tipo: '',
      asistencias: 0,
      dentro: false,
      currentlyInside: false,
      serverMs: Math.max(0, Date.now() - startedAt),
    })
  }

  const result = await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      const r = await procesarEscaneo(client, {
        qr,
        modo,
        zonaClave,
        operador: c.get('usuario'),
        origen: 'panel',
        alcance: c.get('alcance'),
        dispositivo: dispositivo || undefined,
        clientMs,
        startedAt,
      })
      await client.query('COMMIT')
      return r
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  })
  resumenCache.clear()
  return c.json(result)
})

panel.patch('/escaneos/:id/latencia', async (c) => {
  if (c.get('alcance') !== 'interno') {
    return c.json({ ok: false, error: 'solo_interno' }, 403)
  }
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'id' }, 400)
  const datos = await c.req.json().catch(() => ({}))
  const ms = parseClientMs(datos.clientLatencyMs ?? datos.client_ms)
  if (ms == null) return c.json({ ok: false, error: 'clientLatencyMs' }, 400)
  const updated = await query(
    `UPDATE accesos_escaneos
     SET client_ms = COALESCE(client_ms, $2)
     WHERE id = $1 AND operador = $3
     RETURNING id, client_ms, server_ms`,
    [id, ms, c.get('usuario')],
  )
  if (!updated[0]) return c.json({ ok: false, error: 'no_encontrado' }, 404)
  return c.json({ ok: true, scan: updated[0] })
})

type GafeteOk = { nombre: string; folio: string; tipo: string; subtitulo: string }
type GafeteErr = { error: string; status: 403 | 404 }

/** Tipo permitido para la sesión (el permiso lo revisa REGLAS). null si todo bien. */
function accesoGafete(c: { get: (k: keyof Vars) => string }, tipo: string): GafeteErr | null {
  const okTipos = tiposDe(c.get('alcance'))
  if (!okTipos.includes(tipo as TipoClave)) {
    return { error: 'sin_acceso', status: 403 }
  }
  return null
}

async function gafeteFila(
  c: { get: (k: keyof Vars) => string },
  tipo: string,
  id: number,
): Promise<GafeteOk | GafeteErr> {
  const acceso = accesoGafete(c, tipo)
  if (acceso) return acceso
  // Sin permiso de búsqueda (mesa de registro) solo se imprime a quien ella dio de alta.
  if (!puede(c.get('alcance'), 'buscar') && !(await esAltaDe(tipo as TipoClave, id, c.get('usuario')))) {
    return { error: 'solo_altas_propias', status: 403 }
  }
  const t = TIPOS[tipo as TipoClave]
  const fila = await queryOne(`SELECT * FROM "${t.tabla}" WHERE "${t.id}" = $1`, [id])
  if (!fila) return { error: 'no_encontrado', status: 404 }
  const extra = t.extra ? String(fila[t.extra] ?? '') : ''
  return {
    nombre: nombreDe(fila),
    folio: folioDe(tipo as TipoClave, id),
    tipo: t.etiqueta,
    subtitulo: extra,
  }
}

panel.get('/gafete/:tipo/:id', async (c) => {
  const tipo = c.req.param('tipo')
  let idStr = c.req.param('id')
  const asPdf = /\.pdf$/i.test(idStr)
  if (asPdf) idStr = idStr.replace(/\.pdf$/i, '')
  const id = Number(idStr)
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'id' }, 400)
  const datos = await gafeteFila(c, tipo, id)
  if ('status' in datos) {
    return c.json({ ok: false, error: datos.error }, datos.status)
  }
  if (asPdf) {
    const pdf = await boletoPdf(datos.nombre, datos.folio, datos.tipo, datos.subtitulo)
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="gafete-${datos.folio}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  }
  const [payload, conteo] = await Promise.all([
    boletoPayload(datos.nombre, datos.folio, datos.tipo, datos.subtitulo),
    conteoImpresion(tipo, id),
  ])
  // Campos nuevos, sin tocar los existentes: impresiones (número) y ultimaImpresion (ISO|null).
  return c.json({ ...payload, ...conteo })
})

// ===================== Impresiones (registro de boletos impresos) =====================
// Hoy imprimir un boleto no dejaba rastro. Estas rutas registran cada impresión real,
// permiten verlas y "deshacerlas" (como si aún no se hubiera impreso). Nada toca el escaneo.
// Mismo middleware/sesión que /gafete; requieren alcance interno y tipo permitido.
//
//   POST   /gafete/:tipo/:id/impresion
//            body JSON opcional { via, impresora, modoColor, jobId, dispositivo }
//            via: ql|chrome|pdf|test (defecto ql) · modoColor: mono|redblack|null
//            impresora/dispositivo <= 120 chars · jobId entero >= 0 · operador = usuario de sesión
//            -> { ok:true, impresion:{ id, creado, tipo, registroId, folio, via, impresora,
//                 modoColor, jobId, operador, dispositivo }, total, ultima }
//   GET    /gafete/:tipo/:id/impresiones
//            -> { ok:true, total, ultima, impresiones:[...] }  (máx 50, más recientes primero)
//   DELETE /gafete/:tipo/:id/impresion/:impresionId
//            -> { ok:true, borradas:1, total, ultima }  · 404 no_encontrado si no existe
//   DELETE /gafete/:tipo/:id/impresiones
//            -> { ok:true, borradas:n, total:0, ultima:null } · 404 sin_impresiones si no había
//   GET    /gafete/:tipo/:id (JSON) añade impresiones y ultimaImpresion; GET /buscar los añade por resultado.
//   GET    /impresiones?limite=200&q=&tipo=&via=&operador=&antes=<id>   (auditoría global, interno)
//            q busca en folio, nombre, operador, impresora y dispositivo · antes = id del último
//            registro recibido (cursor) · -> { ok:true, total, registros:[ impresion + nombre,
//            tipoEtiqueta ], siguiente:id|null }
//   400 { ok:false, error }: id | impresionId | via | modoColor | jobId | impresora_larga |
//        dispositivo_largo | tipo | operador | antes | limite | q_larga
//   403 solo_interno | sin_acceso · 404 no_encontrado (la persona no existe)

panel.post('/gafete/:tipo/:id/impresion', async (c) => {
  const tipo = c.req.param('tipo')
  const id = parseEnteroId(c.req.param('id'))
  if (id == null) return c.json({ ok: false, error: 'id' }, 400)
  const datos = await gafeteFila(c, tipo, id)
  if ('status' in datos) return c.json({ ok: false, error: datos.error }, datos.status)

  const raw = await c.req.json().catch(() => ({}))
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const via =
    body.via == null || body.via === '' ? 'ql' : String(body.via).trim().toLowerCase()
  if (!IMPRESION_VIAS.has(via)) return c.json({ ok: false, error: 'via' }, 400)
  const modoRaw = body.modoColor ?? body.modo_color
  const modoColor =
    modoRaw == null || modoRaw === '' ? null : String(modoRaw).trim().toLowerCase()
  if (modoColor != null && !IMPRESION_MODOS_COLOR.has(modoColor)) {
    return c.json({ ok: false, error: 'modoColor' }, 400)
  }
  const jobRaw = body.jobId ?? body.job_id
  let jobId: number | null = null
  if (jobRaw != null && jobRaw !== '') {
    const n = Number(jobRaw)
    if (!Number.isInteger(n) || n < 0 || n > 2_147_483_647) {
      return c.json({ ok: false, error: 'jobId' }, 400)
    }
    jobId = n
  }
  const impresora = textoOpcional(body.impresora, 120)
  if (impresora === undefined) return c.json({ ok: false, error: 'impresora_larga' }, 400)
  const dispositivo = textoOpcional(body.dispositivo, 120)
  if (dispositivo === undefined) return c.json({ ok: false, error: 'dispositivo_largo' }, 400)

  const fila = await queryOne<ImpresionRow>(
    `INSERT INTO accesos_impresiones
       (tipo, registro_id, folio, via, impresora, modo_color, job_id, operador, dispositivo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING ${IMPRESION_COLS}`,
    [
      tipo,
      id,
      datos.folio,
      via,
      impresora,
      modoColor,
      jobId,
      c.get('usuario').slice(0, 120),
      dispositivo,
    ],
  )
  if (!fila) return c.json({ ok: false, error: 'insert' }, 500)
  const conteo = await conteoImpresion(tipo, id)
  return c.json({
    ok: true,
    impresion: impresionJson(fila),
    total: conteo.impresiones,
    ultima: conteo.ultimaImpresion,
  })
})

panel.get('/gafete/:tipo/:id/impresiones', async (c) => {
  const tipo = c.req.param('tipo')
  const id = parseEnteroId(c.req.param('id'))
  if (id == null) return c.json({ ok: false, error: 'id' }, 400)
  const datos = await gafeteFila(c, tipo, id)
  if ('status' in datos) return c.json({ ok: false, error: datos.error }, datos.status)
  const [rows, conteo] = await Promise.all([
    query<ImpresionRow>(
      `SELECT ${IMPRESION_COLS} FROM accesos_impresiones
       WHERE tipo = $1 AND registro_id = $2
       ORDER BY creado DESC, id DESC LIMIT ${IMPRESIONES_POR_PERSONA}`,
      [tipo, id],
    ),
    conteoImpresion(tipo, id),
  ])
  return c.json({
    ok: true,
    total: conteo.impresiones,
    ultima: conteo.ultimaImpresion,
    impresiones: rows.map(impresionJson),
  })
})

// Los DELETE no exigen que la persona siga existiendo (solo alcance/tipo): así se puede limpiar siempre.
panel.delete('/gafete/:tipo/:id/impresion/:impresionId', async (c) => {
  const tipo = c.req.param('tipo')
  const id = parseEnteroId(c.req.param('id'))
  if (id == null) return c.json({ ok: false, error: 'id' }, 400)
  const impresionId = parseEnteroId(c.req.param('impresionId'))
  if (impresionId == null) return c.json({ ok: false, error: 'impresionId' }, 400)
  const acceso = accesoGafete(c, tipo)
  if (acceso) return c.json({ ok: false, error: acceso.error }, acceso.status)
  const borradas = await query(
    `DELETE FROM accesos_impresiones WHERE id = $1 AND tipo = $2 AND registro_id = $3 RETURNING id`,
    [impresionId, tipo, id],
  )
  if (!borradas.length) return c.json({ ok: false, error: 'no_encontrado' }, 404)
  const conteo = await conteoImpresion(tipo, id)
  return c.json({
    ok: true,
    borradas: borradas.length,
    total: conteo.impresiones,
    ultima: conteo.ultimaImpresion,
  })
})

panel.delete('/gafete/:tipo/:id/impresiones', async (c) => {
  const tipo = c.req.param('tipo')
  const id = parseEnteroId(c.req.param('id'))
  if (id == null) return c.json({ ok: false, error: 'id' }, 400)
  const acceso = accesoGafete(c, tipo)
  if (acceso) return c.json({ ok: false, error: acceso.error }, acceso.status)
  const borradas = await query(
    `DELETE FROM accesos_impresiones WHERE tipo = $1 AND registro_id = $2 RETURNING id`,
    [tipo, id],
  )
  if (!borradas.length) return c.json({ ok: false, error: 'sin_impresiones' }, 404)
  return c.json({ ok: true, borradas: borradas.length, total: 0, ultima: null })
})

panel.get('/impresiones', async (c) => {
  let q = (c.req.query('q') || '').trim()
  if (q.length > 120) return c.json({ ok: false, error: 'q_larga' }, 400)
  q = q.replace(/%/g, '').replace(/_/g, '')
  const tipoFiltro = c.req.query('tipo') || ''
  const viaFiltro = (c.req.query('via') || '').trim().toLowerCase()
  const operador = (c.req.query('operador') || '').trim()
  const antesArg = c.req.query('antes') || ''
  let limite = Number(c.req.query('limite') || 200)
  if (!Number.isFinite(limite)) return c.json({ ok: false, error: 'limite' }, 400)
  limite = Math.min(Math.max(1, Math.floor(limite)), 2000)

  const tipos = tiposDe(c.get('alcance'))
  const cond: string[] = ['TRUE']
  const params: unknown[] = []
  const add = (sql: string, v: unknown) => {
    params.push(v)
    cond.push(sql.replace('?', `$${params.length}`))
  }
  if (tipoFiltro) {
    if (!tipos.includes(tipoFiltro as TipoClave)) return c.json({ ok: false, error: 'tipo' }, 400)
    add('i.tipo = ?', tipoFiltro)
  }
  if (viaFiltro) {
    if (!IMPRESION_VIAS.has(viaFiltro)) return c.json({ ok: false, error: 'via' }, 400)
    add('i.via = ?', viaFiltro)
  }
  if (operador) {
    if (operador.length > 120) return c.json({ ok: false, error: 'operador' }, 400)
    add('i.operador = ?', operador)
  }
  if (antesArg) {
    const antes = parseEnteroId(antesArg)
    if (antes == null) return c.json({ ok: false, error: 'antes' }, 400)
    add('i.id < ?', antes)
  }
  if (q) {
    params.push(`%${q}%`)
    const p = `$${params.length}`
    cond.push(
      `(i.folio ILIKE ${p} OR COALESCE(n.nombre,'') ILIKE ${p} OR COALESCE(i.operador,'') ILIKE ${p}
        OR COALESCE(i.impresora,'') ILIKE ${p} OR COALESCE(i.dispositivo,'') ILIKE ${p})`,
    )
  }
  // Nombre por tipo desde las tablas de registro (misma expresión que la búsqueda, usa los índices trgm).
  const nombres = tipos
    .map(
      (k) =>
        `SELECT '${k}'::text AS tipo, "${TIPOS[k].id}"::int AS registro_id, ${TIPOS[k].nombreSql} AS nombre
         FROM "${TIPOS[k].tabla}"`,
    )
    .join(' UNION ALL ')
  const desde = `FROM accesos_impresiones i
    LEFT JOIN (${nombres}) n ON n.tipo = i.tipo AND n.registro_id = i.registro_id
    WHERE ${cond.join(' AND ')}`
  const cols = IMPRESION_COLS.split(', ')
    .map((col) => `i.${col}`)
    .join(', ')
  const [total, rows] = await Promise.all([
    queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n ${desde}`, params),
    query<ImpresionRow & { nombre: string | null }>(
      `SELECT ${cols}, COALESCE(n.nombre,'') AS nombre ${desde}
       ORDER BY i.creado DESC, i.id DESC LIMIT $${params.length + 1}`,
      [...params, limite],
    ),
  ])
  const registros = rows.map((r) => ({
    ...impresionJson(r),
    nombre: String(r.nombre || '').trim(),
    tipoEtiqueta: TIPOS[r.tipo as TipoClave]?.etiqueta ?? r.tipo,
  }))
  const siguiente = rows.length === limite ? registros[registros.length - 1].id : null
  return c.json({ ok: true, total: total?.n || 0, registros, siguiente, puedeOperar: true })
})

panel.get('/reportes', async (c) => {
  const modo = c.req.query('modo') || ''
  const okArg = c.req.query('ok')
  const zona = c.req.query('zona') || ''
  const codigo = c.req.query('codigo') || ''
  const dispositivo = c.req.query('dispositivo') || ''
  const origen = c.req.query('origen') || ''
  const operador = c.req.query('operador') || ''
  let q = (c.req.query('q') || '').trim()
  if (q.length > 120) return c.json({ ok: false, error: 'q_larga' }, 400)
  const formato = (c.req.query('formato') || 'json').toLowerCase()
  let limite = Number(c.req.query('limite') || 200)
  if (!Number.isFinite(limite)) return c.json({ ok: false, error: 'limite' }, 400)
  limite = Math.min(Math.max(1, Math.floor(limite)), 2000)

  const cond: string[] = ['TRUE']
  const params: unknown[] = []
  const add = (sql: string, v: unknown) => {
    params.push(v)
    cond.push(sql.replace('?', `$${params.length}`))
  }
  if (modo === 'entrada' || modo === 'salida') add('modo = ?', modo)
  if (okArg === '1' || okArg === '0' || okArg === 'true' || okArg === 'false') {
    add('ok = ?', okArg === '1' || okArg === 'true')
  }
  if (zona) {
    if (!/^[a-z0-9_-]{1,40}$/.test(zona)) return c.json({ ok: false, error: 'zona' }, 400)
    add('zona_clave = ?', zona)
  }
  if (codigo) {
    if (!/^[A-Z0-9_]{1,40}$/i.test(codigo)) return c.json({ ok: false, error: 'codigo' }, 400)
    add('codigo = ?', codigo.toUpperCase())
  }
  if (dispositivo) {
    add('dispositivo = ?', sanitizeDevice(dispositivo))
  }
  if (origen === 'panel' || origen === 'demo') add('origen = ?', origen)
  if (operador) add('operador = ?', operador.slice(0, 50))
  if (q) {
    params.push(`%${q}%`)
    const p = `$${params.length}`
    cond.push(
      `(nombre ILIKE ${p} OR CAST(registro_id AS TEXT) ILIKE ${p} OR COALESCE(dispositivo,'') ILIKE ${p} OR COALESCE(codigo,'') ILIKE ${p})`,
    )
  }
  const donde = cond.join(' AND ')
  params.push(limite)
  const limP = `$${params.length}`

  const kpiParams = params.slice(0, -1)
  const [kpis, zonasOpts, rows, devices] = await Promise.all([
    queryOne<{
      total: number
      entradas: number
      salidas: number
      rechazos: number
      reingresos: number
      p50_server: number | null
      p95_server: number | null
    }>(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ok AND modo = 'entrada')::int AS entradas,
        COUNT(*) FILTER (WHERE ok AND modo = 'salida')::int AS salidas,
        COUNT(*) FILTER (WHERE NOT ok)::int AS rechazos,
        COUNT(*) FILTER (WHERE ok AND codigo = 'OK_REENTRY')::int AS reingresos,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY server_ms)::float AS p50_server,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY server_ms)::float AS p95_server
      FROM accesos_escaneos WHERE ${donde}`,
      kpiParams,
    ),
    query(`SELECT clave, nombre FROM accesos_zonas WHERE activo ORDER BY id`),
    query(
      `SELECT id, creado, tipo, registro_id, nombre, modo, ok, mensaje, zona_clave, origen, operador,
              codigo, dispositivo, server_ms, client_ms
       FROM accesos_escaneos WHERE ${donde}
       ORDER BY creado DESC LIMIT ${limP}`,
      params,
    ),
    query<{ dispositivo: string }>(
      `SELECT DISTINCT COALESCE(dispositivo,'') AS dispositivo
       FROM accesos_escaneos
       WHERE dispositivo IS NOT NULL AND dispositivo <> ''
       ORDER BY 1 LIMIT 80`,
    ),
  ])

  const registros = rows.map(escaneoJson)
  if (formato === 'csv') {
    const header =
      'hora,ok,codigo,modo,nombre,tipo,folio_id,zona,mensaje,origen,operador,dispositivo,server_ms,client_ms\n'
    const lines = registros.map((r) =>
      [
        r.creado,
        r.ok,
        r.codigo,
        r.modo,
        r.nombre,
        r.tipo,
        r.registro_id,
        r.zona_clave,
        r.mensaje,
        r.origen,
        r.operador,
        r.dispositivo,
        r.server_ms,
        r.client_ms,
      ]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    const bom = '\uFEFF'
    return new Response(bom + header + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="accesos-ficti.csv"',
        'Cache-Control': 'no-store',
      },
    })
  }
  if (formato === 'xlsx' || formato === 'xls') {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Accesos')
    ws.addRow([
      'Hora',
      'OK',
      'Codigo',
      'Modo',
      'Nombre',
      'Tipo',
      'ID',
      'Zona',
      'Mensaje',
      'Origen',
      'Operador',
      'Dispositivo',
      'ServerMs',
      'ClientMs',
    ])
    for (const r of registros) {
      ws.addRow([
        r.creado,
        r.ok,
        r.codigo,
        r.modo,
        r.nombre,
        r.tipo,
        r.registro_id,
        r.zona_clave,
        r.mensaje,
        r.origen,
        r.operador,
        r.dispositivo,
        r.server_ms,
        r.client_ms,
      ])
    }
    const buf = await wb.xlsx.writeBuffer()
    return new Response(Buffer.from(buf), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="accesos-ficti.xlsx"',
        'Cache-Control': 'no-store',
      },
    })
  }

  return c.json({
    kpis: kpis || {
      total: 0,
      entradas: 0,
      salidas: 0,
      rechazos: 0,
      reingresos: 0,
      p50_server: null,
      p95_server: null,
    },
    registros,
    zonas: zonasOpts,
    dispositivos: devices.map((d) => d.dispositivo).filter(Boolean),
    puedeOperar: c.get('alcance') === 'interno',
  })
})

// ===================== Mesa de atención (registro en sitio, ficha, reenvío) =====================

const DESDE_HOY = `date_trunc('day', NOW() AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City'`

type PersonaRef = { tipo: TipoClave; id: number }
type PersonaErr = { error: string; status: 400 | 403 | 404 }

/** :tipo/:id válidos y dentro del alcance; la mesa de registro solo ve sus altas. */
async function personaDe(c: Ctx): Promise<PersonaRef | PersonaErr> {
  const tipo = String(c.req.param('tipo') || '') as TipoClave
  const id = parseEnteroId(c.req.param('id'))
  if (id == null) return { error: 'id', status: 400 }
  if (!tiposDe(c.get('alcance')).includes(tipo)) return { error: 'sin_acceso', status: 403 }
  if (!puede(c.get('alcance'), 'buscar') && !(await esAltaDe(tipo, id, c.get('usuario')))) {
    return { error: 'solo_altas_propias', status: 403 }
  }
  return { tipo, id }
}

panel.post('/registro', async (c) => {
  const raw = await c.req.json().catch(() => null)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return c.json({ ok: false, error: 'datos', mensaje: 'Formulario vacío.' }, 400)
  }
  const datos = raw as Record<string, unknown>
  const r = await crearAltaSitio(datos, c.get('usuario'), sanitizeDevice(datos.dispositivo) || null)
  if (!r.ok) return c.json(r, r.error === 'ya_registrado' ? 409 : 400)
  const envio =
    datos.enviarCorreo === true
      ? await enviarBoleto({ tipo: r.tipo, id: r.id, motivo: 'alta_sitio', operador: c.get('usuario') })
      : null
  resumenCache.clear()
  return c.json({ ...r, envio })
})

/** Últimas altas del operador: la mesa de registro no busca, pero sí reimprime lo suyo. */
panel.get('/mis-altas', async (c) => {
  const tipos = tiposDe(c.get('alcance'))
  const nombres = tipos
    .map(
      (k) =>
        `SELECT '${k}'::text AS tipo, "${TIPOS[k].id}"::int AS registro_id, ${TIPOS[k].nombreSql} AS nombre
         FROM "${TIPOS[k].tabla}"`,
    )
    .join(' UNION ALL ')
  const rows = await query<{ tipo: string; registro_id: number; creado: Date; nombre: string; impresiones: number }>(
    `SELECT a.tipo, a.registro_id, a.creado, COALESCE(n.nombre,'') AS nombre,
            (SELECT COUNT(*)::int FROM accesos_impresiones i
             WHERE i.tipo = a.tipo AND i.registro_id = a.registro_id) AS impresiones
     FROM accesos_altas_sitio a
     LEFT JOIN (${nombres}) n ON n.tipo = a.tipo AND n.registro_id = a.registro_id
     WHERE a.operador = $1 AND a.tipo = ANY($2::text[])
     ORDER BY a.creado DESC LIMIT 30`,
    [c.get('usuario'), tipos],
  )
  return c.json({
    ok: true,
    altas: rows.map((r) => ({
      tipo: r.tipo,
      id: Number(r.registro_id),
      folio: folioDe(r.tipo as TipoClave, Number(r.registro_id)),
      nombre: String(r.nombre || '').trim(),
      creado: isoDe(r.creado),
      impresiones: Number(r.impresiones || 0),
    })),
  })
})

panel.get('/persona/:tipo/:id', async (c) => {
  const p = await personaDe(c)
  if ('error' in p) return c.json({ ok: false, error: p.error }, p.status)
  const ficha = await fichaPersona(p.tipo, p.id)
  if (!ficha) return c.json({ ok: false, error: 'no_encontrado' }, 404)
  const rol = c.get('alcance')
  return c.json({
    ...ficha,
    puede: {
      reenviar: puede(rol, 'reenviar'),
      imprimir: puede(rol, 'imprimir'),
      desmarcar: puede(rol, 'desmarcar'),
      confirmar: puede(rol, 'buscar'),
    },
  })
})

panel.post('/persona/:tipo/:id/reenviar', async (c) => {
  const p = await personaDe(c)
  if ('error' in p) return c.json({ ok: false, error: p.error }, p.status)
  if (!rateOk(`reenvio:${c.get('usuario')}`, 30, 60_000)) {
    return c.json({ ok: false, error: 'rate_limit', mensaje: 'Demasiados reenvíos seguidos; espera un minuto.' }, 429)
  }
  const raw = await c.req.json().catch(() => ({}))
  const otro = String((raw as { correo?: unknown })?.correo ?? '')
    .trim()
    .toLowerCase()
  if (otro && !correoValido(otro)) {
    return c.json({ ok: false, error: 'correo', mensaje: 'El correo alterno no es válido.' }, 400)
  }
  const fila = await filaPersona(p.tipo, p.id)
  if (!fila) return c.json({ ok: false, error: 'no_encontrado' }, 404)
  const destino = otro || correoPrincipal(fila)
  if (!correoValido(destino)) {
    return c.json({ ok: false, error: 'sin_correo', mensaje: 'La persona no tiene un correo válido; usa otro correo.' }, 400)
  }
  const r = await enviarBoleto({ tipo: p.tipo, id: p.id, correo: destino, motivo: 'reenvio', operador: c.get('usuario') })
  return c.json({ ...r, correo: destino }, r.ok ? 200 : 502)
})

panel.post('/persona/:tipo/:id/confirmar', async (c) => {
  const p = await personaDe(c)
  if ('error' in p) return c.json({ ok: false, error: p.error }, p.status)
  const ok = await confirmarPersona(p.tipo, p.id)
  if (!ok) return c.json({ ok: false, error: 'no_encontrado' }, 404)
  resumenCache.clear()
  return c.json({ ok: true, confirmado: true })
})

panel.get('/persona/:tipo/:id/correo-eventos', async (c) => {
  const p = await personaDe(c)
  if ('error' in p) return c.json({ ok: false, error: p.error }, p.status)
  const fila = await filaPersona(p.tipo, p.id)
  if (!fila) return c.json({ ok: false, error: 'no_encontrado' }, 404)
  // El correo registrado y los alternos a los que se reenvió (máx. 3 consultas a Brevo).
  const alternos = await query<{ correo: string }>(
    `SELECT DISTINCT LOWER(correo) AS correo FROM correo_envios
     WHERE tipo = $1 AND registro_id = $2 AND ok`,
    [p.tipo, p.id],
  ).catch(() => [])
  const correos = [...new Set([correoPrincipal(fila).toLowerCase(), ...alternos.map((a) => a.correo)])]
    .filter(correoValido)
    .slice(0, 3)
  const respuestas = await Promise.all(correos.map((correo) => eventosCorreo(correo)))
  const fallo = respuestas.find((r) => !r.ok)
  const eventos = respuestas.flatMap((r, i) =>
    Array.isArray(r.eventos) ? (r.eventos as Record<string, unknown>[]).map((e) => ({ ...e, correo: correos[i] })) : [],
  )
  return c.json({
    ok: !fallo || eventos.length > 0,
    error: fallo?.error ?? null,
    mensaje: fallo?.mensaje ?? null,
    correos,
    eventos,
  })
})

panel.get('/mesa', async (c) => {
  const tipos = tiposDe(c.get('alcance'))
  const nombres = tipos
    .map(
      (k) =>
        `SELECT '${k}'::text AS tipo, "${TIPOS[k].id}"::int AS registro_id, ${TIPOS[k].nombreSql} AS nombre
         FROM "${TIPOS[k].tabla}"`,
    )
    .join(' UNION ALL ')
  const [altas, impresiones, envios, recientes, totalAltas, usuarios] = await Promise.all([
    query<{ operador: string; n: number }>(
      `SELECT operador, COUNT(*)::int AS n FROM accesos_altas_sitio
       WHERE creado >= ${DESDE_HOY} GROUP BY 1`,
    ),
    query<{ operador: string; n: number }>(
      `SELECT COALESCE(operador,'') AS operador, COUNT(*)::int AS n FROM accesos_impresiones
       WHERE creado >= ${DESDE_HOY} GROUP BY 1`,
    ),
    query<{ operador: string; n: number; fallos: number }>(
      `SELECT COALESCE(operador,'') AS operador,
              COUNT(*) FILTER (WHERE ok)::int AS n,
              COUNT(*) FILTER (WHERE NOT ok)::int AS fallos
       FROM correo_envios
       WHERE creado >= ${DESDE_HOY} AND motivo IN ('reenvio','alta_sitio') GROUP BY 1`,
    ),
    query<{ accion: string; tipo: string; registro_id: number; operador: string; creado: Date; detalle: string; nombre: string }>(
      `SELECT a.*, COALESCE(n.nombre,'') AS nombre FROM (
         (SELECT 'alta' AS accion, tipo, registro_id, operador, creado, '' AS detalle
          FROM accesos_altas_sitio ORDER BY creado DESC LIMIT 40)
         UNION ALL
         (SELECT 'impresion', tipo, registro_id, COALESCE(operador,''), creado, via
          FROM accesos_impresiones ORDER BY creado DESC LIMIT 40)
         UNION ALL
         (SELECT CASE WHEN ok THEN 'reenvio' ELSE 'reenvio_fallido' END, tipo, registro_id,
                 COALESCE(operador,''), creado, correo
          FROM correo_envios WHERE motivo IN ('reenvio','alta_sitio') ORDER BY creado DESC LIMIT 40)
       ) a
       LEFT JOIN (${nombres}) n ON n.tipo = a.tipo AND n.registro_id = a.registro_id
       WHERE a.tipo = ANY($1::text[])
       ORDER BY a.creado DESC LIMIT 60`,
      [tipos],
    ),
    queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM accesos_altas_sitio`),
    query<{ usuario: string; nombre: string }>(`SELECT usuario, nombre FROM panel_usuarios`),
  ])

  const nombreOp = new Map(usuarios.map((u) => [u.usuario, u.nombre]))
  const porOperador = new Map<string, { operador: string; nombre: string; altas: number; impresiones: number; reenvios: number; fallos: number }>()
  const fila = (op: string) => {
    let f = porOperador.get(op)
    if (!f) {
      f = { operador: op, nombre: nombreOp.get(op) ?? op, altas: 0, impresiones: 0, reenvios: 0, fallos: 0 }
      porOperador.set(op, f)
    }
    return f
  }
  for (const r of altas) fila(r.operador).altas = r.n
  for (const r of impresiones) fila(r.operador).impresiones = r.n
  for (const r of envios) {
    fila(r.operador).reenvios = r.n
    fila(r.operador).fallos = r.fallos
  }
  const operadores = [...porOperador.values()].sort(
    (a, b) => b.altas + b.impresiones + b.reenvios - (a.altas + a.impresiones + a.reenvios),
  )
  const suma = (k: 'altas' | 'impresiones' | 'reenvios' | 'fallos') => operadores.reduce((s, o) => s + o[k], 0)

  return c.json({
    ok: true,
    hoy: { altas: suma('altas'), impresiones: suma('impresiones'), reenvios: suma('reenvios'), fallos: suma('fallos') },
    altasTotales: totalAltas?.n ?? 0,
    operadores,
    recientes: recientes.map((r) => ({
      accion: r.accion,
      tipo: r.tipo,
      registroId: Number(r.registro_id),
      folio: TIPOS[r.tipo as TipoClave] ? folioDe(r.tipo as TipoClave, Number(r.registro_id)) : String(r.registro_id),
      nombre: String(r.nombre || '').trim(),
      operador: r.operador,
      operadorNombre: nombreOp.get(r.operador) ?? r.operador,
      detalle: r.detalle,
      creado: isoDe(r.creado),
    })),
  })
})

panel.get('/equipo', async (c) => {
  const rows = await query<{ usuario: string; nombre: string; alcance: string; activo: boolean; ultimo_acceso: Date | null }>(
    `SELECT usuario, nombre, alcance, activo, ultimo_acceso FROM panel_usuarios
     ORDER BY activo DESC, alcance, usuario`,
  )
  return c.json({
    ok: true,
    usuarios: rows.map((r) => ({
      usuario: r.usuario,
      nombre: r.nombre,
      rol: r.alcance,
      rolNombre: ROLES[r.alcance]?.nombre ?? r.alcance,
      activo: r.activo,
      ultimoAcceso: isoDe(r.ultimo_acceso),
    })),
  })
})

app.route('/api/accesos', panel)

// ===================== DEMO PDA =====================
function scanAutorizado(c: { req: { header: (n: string) => string | undefined } }): boolean {
  const presented = (c.req.header('X-Scan-Key') || '').trim()
  if (SCAN_API_KEY) return safeEq(presented, SCAN_API_KEY)
  return !PUBLIC_HTTPS
}

app.get('/api/zonas', async (c) => {
  if (!scanAutorizado(c)) return c.json({ ok: false, error: 'no_autorizado' }, 401)
  const ip = clientIp(c.req.raw.headers)
  if (!rateOk(`demo-zonas:${ip}`, 90, 60_000)) {
    return c.json({ ok: false, error: 'rate_limit' }, 429)
  }
  try {
    const zonas = await query(
      `SELECT clave, nombre, aforo, dentro, activo FROM accesos_zonas WHERE activo ORDER BY id`,
    )
    return c.json({ zonas })
  } catch (e) {
    console.error('api_zonas', e)
    return c.json({ zonas: [] })
  }
})

app.post('/api/escanear', async (c) => {
  const startedAt = Date.now()
  if (!scanAutorizado(c)) {
    return c.json(
      {
        ok: false,
        codigo: CODIGOS.UNAUTHORIZED,
        mensaje: 'NO AUTORIZADO',
        detalles: 'Falta o es inválida la clave de escáner (X-Scan-Key).',
        pitido: 'error',
        nombre: '',
        tipo: '',
        asistencias: 0,
        dentro: false,
        currentlyInside: false,
        serverMs: Math.max(0, Date.now() - startedAt),
      },
      401,
    )
  }
  const ip = clientIp(c.req.raw.headers)
  if (!rateOk(`demo-scan:${ip}`, 120, 60_000)) {
    return c.json(
      {
        ok: false,
        codigo: CODIGOS.RATE_LIMIT,
        mensaje: 'DEMASIADOS INTENTOS',
        detalles: 'Espera un momento antes de seguir escaneando.',
        pitido: 'error',
        nombre: '',
        tipo: '',
        asistencias: 0,
        dentro: false,
        currentlyInside: false,
        serverMs: Math.max(0, Date.now() - startedAt),
      },
      429,
    )
  }

  const datos = await c.req.json().catch(() => ({}))
  const qr = String(datos.qr_data || datos.qr || '').trim()
  const modo = String(datos.modo || 'entrada').trim().toLowerCase()
  let zona = String(datos.zona || ZONA_DEFECTO).trim().toLowerCase()
  if (!/^[a-z0-9_-]{1,40}$/.test(zona)) zona = ZONA_DEFECTO
  const dispositivo = sanitizeDevice(datos.dispositivo || datos.device || datos.station)
  const clientMs = parseClientMs(datos.clientLatencyMs ?? datos.client_ms)

  if (modo !== 'entrada' && modo !== 'salida') {
    return c.json(
      {
        ok: false,
        codigo: CODIGOS.INVALID_QR,
        mensaje: 'MODO INVALIDO',
        detalles: 'Usa entrada o salida.',
        pitido: 'error',
        nombre: '',
        tipo: '',
        asistencias: 0,
        dentro: false,
        currentlyInside: false,
        serverMs: Math.max(0, Date.now() - startedAt),
      },
      400,
    )
  }
  if (qr.length > 80) {
    return c.json(
      {
        ok: false,
        codigo: CODIGOS.INVALID_QR,
        mensaje: 'CODIGO INVALIDO',
        detalles: 'El código es demasiado largo.',
        pitido: 'error',
        nombre: '',
        tipo: '',
        asistencias: 0,
        dentro: false,
        currentlyInside: false,
        serverMs: Math.max(0, Date.now() - startedAt),
      },
      400,
    )
  }
  if (!qr) {
    return c.json({
      ok: false,
      codigo: CODIGOS.SIN_DATOS,
      mensaje: '❌ SIN DATOS',
      detalles: 'No se recibió ningún código.',
      pitido: 'error',
      nombre: '',
      tipo: '',
      asistencias: 0,
      dentro: false,
      currentlyInside: false,
      serverMs: Math.max(0, Date.now() - startedAt),
    })
  }

  const result = await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      const r = await procesarEscaneo(client, {
        qr,
        modo: modo as 'entrada' | 'salida',
        zonaClave: zona,
        operador: dispositivo || 'pda',
        origen: 'demo',
        alcance: 'interno',
        dispositivo: dispositivo || 'pda',
        clientMs,
        startedAt,
      })
      await client.query('COMMIT')
      return r
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  })
  resumenCache.clear()
  return c.json(result)
})

async function boot() {
  try {
    await ensureIndexes()
    // Warm pool: one cheap round-trip so first scan isn't cold.
    await pool.query('SELECT 1')
    console.log('accesos-api indexes OK + pool warm')
  } catch (e) {
    console.error('indexes warn', e)
  }
  serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
    console.log(`accesos-api TS listening on :${info.port}`)
  })
}

boot().catch((e) => {
  console.error(e)
  process.exit(1)
})

process.on('SIGTERM', async () => {
  await pool.end()
  process.exit(0)
})
