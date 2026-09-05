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
import { CODIGOS } from './codes.js'
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
  const isScan = c.req.path.endsWith('/escanear')
  const max = isScan ? 180 : kind === 'mutacion' ? 40 : 90
  if (!rateOk(`${kind}:${ip}:${isScan ? 'scan' : c.req.path}`, max, 60_000)) {
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
