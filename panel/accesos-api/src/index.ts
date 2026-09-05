import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { compress } from 'hono/compress'
import ExcelJS from 'exceljs'
import {
  TIPOS,
  ZONA_DEFECTO,
  folioDe,
  nombreDe,
  sesionJson,
  tiposDe,
  type TipoClave,
} from './catalog.js'
import { ensureIndexes, pool, query, queryOne, withClient } from './db.js'
import { decodeFlaskSession } from './flaskSession.js'
import { boletoPayload, boletoPdf } from './gafete.js'
import { clientIp, origenConfiable, rateOk, safeEq } from './security.js'
import { buscarExacto, buscarTexto, procesarEscaneo } from './scan.js'

const PORT = Number(process.env.PORT || 3080)
const PANEL_SECRET = process.env.PANEL_SECRET_KEY || ''
const SCAN_API_KEY = process.env.SCAN_API_KEY || ''
const PUBLIC_HTTPS = (process.env.PUBLIC_BASE_URL || '').startsWith('https://')

if (!PANEL_SECRET) {
  console.warn('WARN: PANEL_SECRET_KEY empty — panel /api/accesos will 401')
}

type Vars = { usuario: string; nombre: string; alcance: string }

const app = new Hono<{ Variables: Vars }>()
app.use('*', compress())

app.get('/health', (c) => c.json({ ok: true, stack: 'accesos-ts' }))

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

// ===================== PANEL /api/accesos/* =====================
const panel = new Hono<{ Variables: Vars }>()

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
  const max = kind === 'mutacion' ? 40 : 90
  if (!rateOk(`${kind}:${ip}:${c.req.path}`, max, 60_000)) {
    return c.json({ ok: false, error: 'rate_limit' }, 429)
  }
  c.set('usuario', String(sess.usuario))
  c.set('nombre', String(sess.nombre || sess.usuario))
  c.set('alcance', String(sess.alcance || 'promotor'))
  c.header('Cache-Control', 'no-store')
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
  return c.json({ q, results: hits.slice(0, 20) })
})

panel.get('/zonas', async (c) => {
  const zonas = await query(
    `SELECT id, clave, nombre, aforo, dentro, activo FROM accesos_zonas ORDER BY id`,
  )
  return c.json({
    zonas,
    puedeOperar: c.get('alcance') === 'interno',
  })
})

panel.post('/zonas', async (c) => {
  if (c.get('alcance') !== 'interno') {
    return c.json({ ok: false, error: 'solo_interno' }, 403)
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
  if (!clave || !nombre) return c.json({ ok: false, error: 'datos' }, 400)
  await query(
    `INSERT INTO accesos_zonas (clave, nombre, aforo)
     VALUES ($1,$2,$3)
     ON CONFLICT (clave) DO UPDATE
       SET nombre = EXCLUDED.nombre, aforo = EXCLUDED.aforo, activo = TRUE`,
    [clave, nombre, aforo],
  )
  const zonas = await query(
    `SELECT id, clave, nombre, aforo, dentro, activo FROM accesos_zonas ORDER BY id`,
  )
  resumenCache.clear()
  return c.json({ ok: true, zonas })
})

panel.post('/escanear', async (c) => {
  if (c.get('alcance') !== 'interno') {
    return c.json({ ok: false, error: 'solo_interno' }, 403)
  }
  const datos = await c.req.json().catch(() => ({}))
  const qr = String(datos.qr || datos.qr_data || '').trim()
  const modo = String(datos.modo || 'entrada').trim().toLowerCase()
  let zonaClave = String(datos.zona || ZONA_DEFECTO).trim().toLowerCase()
  if (qr.length > 80) return c.json({ ok: false, error: 'qr_largo' }, 400)
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(qr)) {
    return c.json(
      {
        ok: false,
        mensaje: 'CODIGO INVALIDO',
        detalles: 'El QR no tiene un formato reconocido.',
        pitido: 'error',
        nombre: '',
        tipo: '',
        asistencias: 0,
        dentro: false,
      },
      400,
    )
  }
  if (modo !== 'entrada' && modo !== 'salida') {
    return c.json({ ok: false, error: 'modo' }, 400)
  }
  if (!/^[a-z0-9_-]{1,40}$/.test(zonaClave)) {
    return c.json({ ok: false, error: 'zona' }, 400)
  }
  if (!qr) {
    return c.json({
      ok: false,
      mensaje: 'SIN DATOS',
      detalles: 'No se recibió ningún código.',
      pitido: 'error',
      nombre: '',
      tipo: '',
      asistencias: 0,
      dentro: false,
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

type GafeteOk = { nombre: string; folio: string; tipo: string; subtitulo: string }
type GafeteErr = { error: string; status: 403 | 404 }

async function gafeteFila(
  c: { get: (k: keyof Vars) => string },
  tipo: string,
  id: number,
): Promise<GafeteOk | GafeteErr> {
  if (c.get('alcance') !== 'interno') return { error: 'solo_interno', status: 403 }
  const okTipos = tiposDe(c.get('alcance'))
  if (!okTipos.includes(tipo as TipoClave)) {
    return { error: 'sin_acceso', status: 403 }
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
  return c.json(await boletoPayload(datos.nombre, datos.folio, datos.tipo, datos.subtitulo))
})

panel.get('/reportes', async (c) => {
  const modo = c.req.query('modo') || ''
  const okArg = c.req.query('ok')
  const zona = c.req.query('zona') || ''
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
  if (q) {
    params.push(`%${q}%`)
    const p = `$${params.length}`
    cond.push(`(nombre ILIKE ${p} OR CAST(registro_id AS TEXT) ILIKE ${p})`)
  }
  const donde = cond.join(' AND ')
  params.push(limite)
  const limP = `$${params.length}`

  const kpiParams = params.slice(0, -1)
  const [kpis, zonasOpts, rows] = await Promise.all([
    queryOne<{
      total: number
      entradas: number
      salidas: number
      rechazos: number
      reingresos: number
    }>(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ok AND modo = 'entrada')::int AS entradas,
        COUNT(*) FILTER (WHERE ok AND modo = 'salida')::int AS salidas,
        COUNT(*) FILTER (WHERE NOT ok)::int AS rechazos,
        COUNT(*) FILTER (
          WHERE ok AND modo = 'entrada'
            AND EXISTS (
              SELECT 1 FROM accesos_escaneos s2
              WHERE s2.ok AND s2.modo = 'salida'
                AND s2.tipo = accesos_escaneos.tipo
                AND s2.registro_id = accesos_escaneos.registro_id
                AND s2.creado < accesos_escaneos.creado
            )
        )::int AS reingresos
      FROM accesos_escaneos WHERE ${donde}`,
      kpiParams,
    ),
    query(`SELECT clave, nombre FROM accesos_zonas WHERE activo ORDER BY id`),
    query(
      `SELECT id, creado, tipo, registro_id, nombre, modo, ok, mensaje, zona_clave, origen, operador
       FROM accesos_escaneos WHERE ${donde}
       ORDER BY creado DESC LIMIT ${limP}`,
      params,
    ),
  ])

  const registros = rows.map(escaneoJson)
  if (formato === 'csv') {
    const header =
      'hora,ok,modo,nombre,tipo,folio_id,zona,mensaje,origen,operador\n'
    const lines = registros.map((r) =>
      [
        r.creado,
        r.ok,
        r.modo,
        r.nombre,
        r.tipo,
        r.registro_id,
        r.zona_clave,
        r.mensaje,
        r.origen,
        r.operador,
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
      'Modo',
      'Nombre',
      'Tipo',
      'ID',
      'Zona',
      'Mensaje',
      'Origen',
      'Operador',
    ])
    for (const r of registros) {
      ws.addRow([
        r.creado,
        r.ok,
        r.modo,
        r.nombre,
        r.tipo,
        r.registro_id,
        r.zona_clave,
        r.mensaje,
        r.origen,
        r.operador,
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
    kpis: kpis || { total: 0, entradas: 0, salidas: 0, rechazos: 0, reingresos: 0 },
    registros,
    zonas: zonasOpts,
    puedeOperar: c.get('alcance') === 'interno',
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
  if (!scanAutorizado(c)) {
    return c.json(
      {
        ok: false,
        mensaje: 'NO AUTORIZADO',
        detalles: 'Falta o es inválida la clave de escáner (X-Scan-Key).',
        pitido: 'error',
        nombre: '',
        tipo: '',
        asistencias: 0,
      },
      401,
    )
  }
  const ip = clientIp(c.req.raw.headers)
  if (!rateOk(`demo-scan:${ip}`, 40, 60_000)) {
    return c.json(
      {
        ok: false,
        mensaje: 'DEMASIADOS INTENTOS',
        detalles: 'Espera un momento antes de seguir escaneando.',
        pitido: 'error',
        nombre: '',
        tipo: '',
        asistencias: 0,
      },
      429,
    )
  }

  const datos = await c.req.json().catch(() => ({}))
  const qr = String(datos.qr_data || datos.qr || '').trim()
  const modo = String(datos.modo || 'entrada').trim().toLowerCase()
  let zona = String(datos.zona || ZONA_DEFECTO).trim().toLowerCase()
  if (!/^[a-z0-9_-]{1,40}$/.test(zona)) zona = ZONA_DEFECTO

  if (modo !== 'entrada' && modo !== 'salida') {
    return c.json({
      ok: false,
      mensaje: 'MODO INVALIDO',
      detalles: 'Usa entrada o salida.',
      pitido: 'error',
      nombre: '',
      tipo: '',
      asistencias: 0,
    }, 400)
  }
  if (qr.length > 80) {
    return c.json({
      ok: false,
      mensaje: 'CODIGO INVALIDO',
      detalles: 'El código es demasiado largo.',
      pitido: 'error',
      nombre: '',
      tipo: '',
      asistencias: 0,
    }, 400)
  }
  if (!qr) {
    return c.json({
      ok: false,
      mensaje: '❌ SIN DATOS',
      detalles: 'No se recibió ningún código.',
      pitido: 'error',
      nombre: '',
      tipo: '',
      asistencias: 0,
    })
  }

  const result = await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      const r = await procesarEscaneo(client, {
        qr,
        modo: modo as 'entrada' | 'salida',
        zonaClave: zona,
        operador: 'pda',
        origen: 'demo',
        alcance: 'interno',
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
    console.log('accesos-api indexes OK')
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
