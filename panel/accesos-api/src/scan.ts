import type pg from 'pg'
import {
  QR_A_TIPO,
  TIPOS,
  ZONA_DEFECTO,
  folioDe,
  nombreDe,
  tiposDe,
  type TipoClave,
} from './catalog.js'
import {
  CODIGOS,
  SCAN_COLS,
  SCAN_COOLDOWN_MS,
  type CodigoAcceso,
} from './codes.js'
import { query, queryOne, type Row } from './db.js'

export type ScanResult = {
  ok: boolean
  codigo: CodigoAcceso
  mensaje: string
  detalles: string
  pitido: 'exito' | 'error'
  nombre: string
  tipo: string
  folio?: string
  asistencias: number
  dentro: boolean
  currentlyInside: boolean
  lastDirection?: 'entrada' | 'salida' | null
  lastScanAt?: string | null
  zona?: string
  zonaNombre?: string
  zonaDentro?: number
  zonaAforo?: number
  dispositivo?: string
  scanId?: number
  serverMs?: number
  reentry?: boolean
}

type ScanOpts = {
  qr: string
  modo: 'entrada' | 'salida'
  zonaClave: string
  operador: string
  origen: 'panel' | 'demo'
  alcance: string
  dispositivo?: string
  clientMs?: number
  startedAt: number
}

/** In-memory duplicate debounce (per process). Key = qr|modo|zona */
const recentKeys = new Map<string, number>()

function pruneRecent(now: number): void {
  if (recentKeys.size < 400) return
  for (const [k, at] of recentKeys) {
    if (now - at > SCAN_COOLDOWN_MS * 4) recentKeys.delete(k)
  }
}

function resultado(
  ok: boolean,
  codigo: CodigoAcceso,
  mensaje: string,
  detalles: string,
  nombre: string,
  tipo: string,
  asistencias: number,
  extra: Record<string, unknown> = {},
): ScanResult {
  const dentro = asistencias > 0
  return {
    ok,
    codigo,
    mensaje,
    detalles,
    pitido: ok ? 'exito' : 'error',
    nombre,
    tipo,
    asistencias,
    dentro,
    currentlyInside: dentro,
    ...extra,
  } as ScanResult
}

function metaZona(zona: Row | null): Record<string, unknown> {
  if (!zona) {
    return { zona: ZONA_DEFECTO, zonaNombre: '', zonaDentro: 0, zonaAforo: 0 }
  }
  return {
    zona: String(zona.clave),
    zonaNombre: String(zona.nombre || zona.clave),
    zonaDentro: Number(zona.dentro || 0),
    zonaAforo: Number(zona.aforo || 0),
  }
}

function serverMsOf(startedAt: number): number {
  return Math.max(0, Math.round(Date.now() - startedAt))
}

export function parseFolio(q: string): { tag: string | null; num: number | null } {
  const s = q.trim().toUpperCase()
  const m = /^(EMPRESARIO|ALUMNO|ELISA_CARRILLO)-(\d+)$/.exec(s)
  if (m) return { tag: m[1], num: Number(m[2]) }
  if (/^\d+$/.test(s)) return { tag: null, num: Number(s) }
  return { tag: null, num: null }
}

async function obtener(
  client: pg.PoolClient,
  clave: TipoClave,
  id: number,
): Promise<Row | null> {
  const t = TIPOS[clave]
  const cols = SCAN_COLS[clave] || '*'
  const res = await client.query(
    `SELECT ${cols} FROM "${t.tabla}" WHERE "${t.id}" = $1`,
    [id],
  )
  return (res.rows[0] as Row) ?? null
}

async function estaBloqueado(
  client: pg.PoolClient,
  tipo: string,
  registroId: number,
): Promise<string | null> {
  const r = await client.query(
    `SELECT motivo FROM accesos_bloqueos
     WHERE tipo = $1 AND registro_id = $2 AND activo
     LIMIT 1`,
    [tipo, registroId],
  )
  if (!r.rows[0]) return null
  return String(r.rows[0].motivo || 'Lista negra')
}

async function ultimoOk(
  client: pg.PoolClient,
  tipo: string,
  registroId: number,
): Promise<{ modo: 'entrada' | 'salida' | null; at: string | null }> {
  const r = await client.query(
    `SELECT modo, creado FROM accesos_escaneos
     WHERE tipo = $1 AND registro_id = $2 AND ok
     ORDER BY creado DESC LIMIT 1`,
    [tipo, registroId],
  )
  const row = r.rows[0]
  if (!row) return { modo: null, at: null }
  const modo = row.modo === 'salida' ? 'salida' : row.modo === 'entrada' ? 'entrada' : null
  const creado = row.creado
  const at =
    creado instanceof Date
      ? creado.toISOString()
      : creado
        ? String(creado)
        : null
  return { modo, at }
}

async function logEscaneo(
  client: pg.PoolClient,
  opts: {
    tipo: string | null
    registroId: number | null
    nombre: string
    modo: string
    ok: boolean
    mensaje: string
    codigo: string
    zona: string
    origen: string
    operador: string | null
    dispositivo: string | null
    serverMs: number
    clientMs: number | null
  },
): Promise<number | undefined> {
  const res = await client.query(
    `INSERT INTO accesos_escaneos
      (tipo, registro_id, nombre, modo, ok, mensaje, zona_clave, origen, operador,
       codigo, dispositivo, server_ms, client_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      opts.tipo || 'desconocido',
      opts.registroId || 0,
      (opts.nombre || '').slice(0, 200),
      opts.modo,
      opts.ok,
      (opts.mensaje || '').slice(0, 160),
      opts.zona,
      opts.origen,
      opts.operador,
      opts.codigo.slice(0, 40),
      opts.dispositivo ? opts.dispositivo.slice(0, 60) : null,
      opts.serverMs,
      opts.clientMs,
    ],
  )
  return res.rows[0]?.id as number | undefined
}

async function cargarZona(client: pg.PoolClient, clave: string): Promise<Row | null> {
  const r = await client.query(
    `SELECT clave, nombre, aforo, dentro, activo, hora_inicio, hora_fin, zona_requerida
     FROM accesos_zonas WHERE clave = $1 AND activo`,
    [clave],
  )
  return (r.rows[0] as Row) ?? null
}

/** True si la hora local CDMX está fuera de [inicio, fin] cuando ambos están definidos. */
function fueraDeHorario(zona: Row): boolean {
  const hi = zona.hora_inicio
  const hf = zona.hora_fin
  if (!hi || !hf) return false
  const toMin = (v: unknown): number | null => {
    const s = String(v)
    const m = /^(\d{1,2}):(\d{2})/.exec(s)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }
  const a = toMin(hi)
  const b = toMin(hf)
  if (a == null || b == null) return false
  // Now in America/Mexico_City
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date())
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0)
  const now = hour * 60 + minute
  if (a <= b) return now < a || now > b
  // ventana que cruza medianoche
  return now < a && now > b
}

export async function resolverRegistro(
  qr: string,
  alcance: string,
  client: pg.PoolClient,
): Promise<{ clave: TipoClave; fila: Row; id: number } | null> {
  const { tag, num } = parseFolio(qr)
  if (num == null) return null
  const tipos = tiposDe(alcance)
  if (tag && QR_A_TIPO[tag]) {
    const clave = QR_A_TIPO[tag]
    if (!tipos.includes(clave)) return null
    const fila = await obtener(client, clave, num)
    return fila ? { clave, fila, id: num } : null
  }
  // Ambiguous numeric: try tipos in parallel
  const found = await Promise.all(
    tipos.map(async (clave) => {
      const fila = await obtener(client, clave, num)
      return fila ? { clave, fila, id: num } : null
    }),
  )
  return found.find(Boolean) ?? null
}

export async function procesarEscaneo(
  client: pg.PoolClient,
  opts: ScanOpts,
): Promise<ScanResult> {
  const {
    qr,
    modo,
    zonaClave,
    operador,
    origen,
    alcance,
    dispositivo,
    clientMs,
    startedAt,
  } = opts
  const demo = origen === 'demo'
  const dispositivoSafe = (dispositivo || '').trim().slice(0, 60) || null
  const clientMsSafe =
    typeof clientMs === 'number' && Number.isFinite(clientMs) && clientMs >= 0 && clientMs <= 120_000
      ? Math.round(clientMs)
      : null

  const finish = async (
    res: ScanResult,
    log: {
      tipo: string | null
      registroId: number | null
      nombre: string
      ok: boolean
      mensaje: string
      codigo: string
      zona: string
    },
  ): Promise<ScanResult> => {
    const ms = serverMsOf(startedAt)
    const scanId = await logEscaneo(client, {
      ...log,
      modo,
      origen,
      operador,
      dispositivo: dispositivoSafe,
      serverMs: ms,
      clientMs: clientMsSafe,
    })
    return {
      ...res,
      serverMs: ms,
      dispositivo: dispositivoSafe || undefined,
      scanId,
    }
  }

  // Debounce / duplicate
  const now = Date.now()
  pruneRecent(now)
  const coolKey = `${qr.toUpperCase()}|${modo}|${zonaClave}`
  const prev = recentKeys.get(coolKey)
  if (prev != null && now - prev < SCAN_COOLDOWN_MS) {
    const codigo = CODIGOS.COOLDOWN
    const res = resultado(
      false,
      codigo,
      demo ? '❌ DUPLICADO' : 'DUPLICADO',
      `Escaneo repetido en menos de ${SCAN_COOLDOWN_MS} ms. Espera un instante.`,
      '',
      '',
      0,
      { codigo },
    )
    return finish(res, {
      tipo: null,
      registroId: null,
      nombre: '',
      ok: false,
      mensaje: res.mensaje,
      codigo,
      zona: zonaClave,
    })
  }
  recentKeys.set(coolKey, now)

  const resolved = await resolverRegistro(qr, alcance, client)
  if (!resolved) {
    const codigo = CODIGOS.NOT_FOUND
    const res = resultado(
      false,
      codigo,
      demo ? '❌ ACCESO DENEGADO' : 'ACCESO DENEGADO',
      `El código "${qr}" no está registrado.`,
      '',
      '',
      0,
    )
    return finish(res, {
      tipo: null,
      registroId: null,
      nombre: '',
      ok: false,
      mensaje: res.mensaje,
      codigo,
      zona: zonaClave,
    })
  }

  const { clave, fila, id } = resolved
  const nombre = nombreDe(fila)
  const etiqueta = TIPOS[clave].etiqueta
  const folio = folioDe(clave, id)
  let asistencias = Number(fila.asistencias || 0)
  const t = TIPOS[clave]
  const zona = await cargarZona(client, zonaClave)
  const mz = metaZona(zona)

  if (!zona) {
    const codigo = CODIGOS.ZONE_REQUIRED
    const res = resultado(
      false,
      codigo,
      demo ? '❌ ZONA INVALIDA' : 'ZONA INVALIDA',
      `La zona "${zonaClave}" no está activa.`,
      nombre,
      etiqueta,
      asistencias,
      { folio, ...mz },
    )
    return finish(res, {
      tipo: clave,
      registroId: id,
      nombre,
      ok: false,
      mensaje: res.mensaje,
      codigo,
      zona: zonaClave,
    })
  }

  if (zona && fueraDeHorario(zona)) {
    const codigo = CODIGOS.OUTSIDE_HOURS
    const res = resultado(
      false,
      codigo,
      demo ? '❌ FUERA DE HORARIO' : 'FUERA DE HORARIO',
      `${zona.nombre} solo admite acceso en su ventana horaria.`,
      nombre,
      etiqueta,
      asistencias,
      { folio, ...mz },
    )
    return finish(res, {
      tipo: clave,
      registroId: id,
      nombre,
      ok: false,
      mensaje: res.mensaje,
      codigo,
      zona: String(zona.clave),
    })
  }

  const bloqueo = await estaBloqueado(client, clave, id)
  if (bloqueo) {
    const codigo = CODIGOS.BLACKLISTED
    const res = resultado(
      false,
      codigo,
      demo ? '❌ LISTA NEGRA' : 'LISTA NEGRA',
      `${nombre}: ${bloqueo}`,
      nombre,
      etiqueta,
      asistencias,
      { folio, ...mz },
    )
    return finish(res, {
      tipo: clave,
      registroId: id,
      nombre,
      ok: false,
      mensaje: res.mensaje,
      codigo,
      zona: zonaClave,
    })
  }

  if (!fila.confirmado) {
    const codigo = CODIGOS.UNCONFIRMED
    const res = resultado(
      false,
      codigo,
      demo ? '❌ NO CONFIRMADO' : 'NO CONFIRMADO',
      `${nombre} aún no confirmó su registro por correo.`,
      nombre,
      etiqueta,
      asistencias,
      { folio, ...mz },
    )
    return finish(res, {
      tipo: clave,
      registroId: id,
      nombre,
      ok: false,
      mensaje: res.mensaje,
      codigo,
      zona: zonaClave,
    })
  }

  if (modo === 'salida') {
    if (asistencias <= 0) {
      const last = await ultimoOk(client, clave, id)
      const codigo = CODIGOS.NOT_INSIDE
      const res = resultado(
        false,
        codigo,
        demo ? '❌ SALIDA DENEGADA' : 'SALIDA DENEGADA',
        `${nombre} no tiene una entrada activa. No hay reingreso pendiente.`,
        nombre,
        etiqueta,
        asistencias,
        {
          folio,
          lastDirection: last.modo,
          lastScanAt: last.at,
          ...mz,
        },
      )
      return finish(res, {
        tipo: clave,
        registroId: id,
        nombre,
        ok: false,
        mensaje: res.mensaje,
        codigo,
        zona: zonaClave,
      })
    }
    await client.query(
      `UPDATE "${t.tabla}" SET asistencias = GREATEST(COALESCE(asistencias,0) - 1, 0)
       WHERE "${t.id}" = $1`,
      [id],
    )
    if (zona) {
      await client.query(
        `UPDATE accesos_zonas SET dentro = GREATEST(dentro - 1, 0) WHERE clave = $1`,
        [zona.clave],
      )
      zona.dentro = Math.max(Number(zona.dentro || 0) - 1, 0)
    }
    const nueva = Math.max(asistencias - 1, 0)
    const codigo = CODIGOS.OK_EXIT
    const res = resultado(
      true,
      codigo,
      demo ? '✅ SALIDA REGISTRADA' : 'SALIDA REGISTRADA',
      `${nombre} (${etiqueta}). Puede reingresar con ENTRADA.`,
      nombre,
      etiqueta,
      nueva,
      {
        folio,
        lastDirection: 'salida',
        lastScanAt: new Date().toISOString(),
        ...metaZona(zona),
      },
    )
    return finish(res, {
      tipo: clave,
      registroId: id,
      nombre,
      ok: true,
      mensaje: res.mensaje,
      codigo,
      zona: zonaClave,
    })
  }

  // entrada
  if (asistencias >= 1) {
    const last = await ultimoOk(client, clave, id)
    const codigo = CODIGOS.ALREADY_INSIDE
    const res = resultado(
      false,
      codigo,
      demo ? '❌ YA DENTRO' : 'YA DENTRO',
      `${nombre} ya ingresó. Escanea SALIDA antes del reingreso.`,
      nombre,
      etiqueta,
      asistencias,
      {
        folio,
        lastDirection: last.modo,
        lastScanAt: last.at,
        ...mz,
      },
    )
    return finish(res, {
      tipo: clave,
      registroId: id,
      nombre,
      ok: false,
      mensaje: res.mensaje,
      codigo,
      zona: zonaClave,
    })
  }

  if (zona) {
    const cap = await client.query(
      `UPDATE accesos_zonas
       SET dentro = dentro + 1
       WHERE clave = $1
         AND activo
         AND (aforo = 0 OR dentro < aforo)
       RETURNING clave, nombre, aforo, dentro`,
      [zona.clave],
    )
    if (!cap.rows[0]) {
      // refresh counts for message
      const z2 = await cargarZona(client, String(zona.clave))
      const codigo = CODIGOS.ZONE_FULL
      const res = resultado(
        false,
        codigo,
        demo ? '❌ ZONA LLENA' : 'ZONA LLENA',
        `${zona.nombre} está al aforo (${z2?.dentro ?? zona.dentro}/${z2?.aforo ?? zona.aforo}).`,
        nombre,
        etiqueta,
        asistencias,
        { folio, ...metaZona(z2 || zona) },
      )
      return finish(res, {
        tipo: clave,
        registroId: id,
        nombre,
        ok: false,
        mensaje: res.mensaje,
        codigo,
        zona: String(zona.clave),
      })
    }
    Object.assign(zona, cap.rows[0])
  }

  await client.query(
    `UPDATE "${t.tabla}" SET asistencias = COALESCE(asistencias,0) + 1 WHERE "${t.id}" = $1`,
    [id],
  )

  const priorExit = await client.query(
    `SELECT 1 FROM accesos_escaneos
     WHERE tipo = $1 AND registro_id = $2 AND ok AND modo = 'salida'
     LIMIT 1`,
    [clave, id],
  )
  const reentry = (priorExit.rowCount ?? priorExit.rows.length) > 0
  const codigo = reentry ? CODIGOS.OK_REENTRY : CODIGOS.OK_ENTRY
  const res = resultado(
    true,
    codigo,
    demo
      ? reentry
        ? '✅ REINGRESO'
        : '✅ ENTRADA REGISTRADA'
      : reentry
        ? 'REINGRESO'
        : 'ENTRADA REGISTRADA',
    `${nombre} (${etiqueta})${reentry ? ' · reingreso' : ''}`,
    nombre,
    etiqueta,
    asistencias + 1,
    {
      folio,
      reentry,
      lastDirection: 'entrada',
      lastScanAt: new Date().toISOString(),
      ...metaZona(zona),
    },
  )
  return finish(res, {
    tipo: clave,
    registroId: id,
    nombre,
    ok: true,
    mensaje: res.mensaje,
    codigo,
    zona: zona ? String(zona.clave) : zonaClave,
  })
}

export type Hit = {
  tipo: TipoClave
  tipoEtiqueta: string
  id: number
  folio: string
  nombre: string
  correo: string
  telefono: string
  extra: string
  confirmado: boolean
  asistencias: number
  dentro: boolean
  match: string
}

function hitDe(clave: TipoClave, fila: Row, match: string): Hit {
  const t = TIPOS[clave]
  const id = Number(fila[t.id])
  const extra = t.extra ? String(fila[t.extra] ?? '') : ''
  const asistencias = Number(fila.asistencias || 0)
  let correo = fila.Correo
  if (Array.isArray(correo)) correo = correo[0] || ''
  return {
    tipo: clave,
    tipoEtiqueta: t.etiqueta,
    id,
    folio: folioDe(clave, id),
    nombre: nombreDe(fila),
    correo: String(correo || ''),
    telefono: String(fila.Telefono || ''),
    extra,
    confirmado: Boolean(fila.confirmado),
    asistencias,
    dentro: asistencias > 0,
    match,
  }
}

export async function buscarExacto(q: string, tipos: TipoClave[]): Promise<Hit[]> {
  const { tag, num } = parseFolio(q)
  if (num == null) return []
  const candidatos: { clave: TipoClave; id: number }[] = []
  if (tag && QR_A_TIPO[tag] && tipos.includes(QR_A_TIPO[tag])) {
    candidatos.push({ clave: QR_A_TIPO[tag], id: num })
  } else if (!tag) {
    for (const t of tipos) candidatos.push({ clave: t, id: num })
  }
  for (const c of candidatos) {
    const t = TIPOS[c.clave]
    const fila = await queryOne(`SELECT * FROM "${t.tabla}" WHERE "${t.id}" = $1`, [c.id])
    if (fila) return [hitDe(c.clave, fila, 'folio')]
  }
  return []
}

export async function buscarTexto(q: string, tipos: TipoClave[]): Promise<Hit[]> {
  const out: Hit[] = []
  const prefix = `${q}%`
  const like = `%${q}%`

  const batches = await Promise.all(
    tipos.map(async (clave) => {
      const t = TIPOS[clave]
      const extra = t.extra ? ` OR CAST("${t.extra}" AS TEXT) ILIKE $1` : ''
      let rows = await query(
        `SELECT * FROM "${t.tabla}"
         WHERE CAST("${t.id}" AS TEXT) ILIKE $1
            OR ${t.nombreSql} ILIKE $1
            OR COALESCE("Correo"::text,'') ILIKE $1
            OR COALESCE("Telefono",'') ILIKE $1
            ${extra}
         ORDER BY "${t.id}" DESC
         LIMIT 12`,
        [prefix],
      )
      if (!rows.length) {
        rows = await query(
          `SELECT * FROM "${t.tabla}"
           WHERE CAST("${t.id}" AS TEXT) ILIKE $1
              OR ${t.nombreSql} ILIKE $1
              OR COALESCE("Correo"::text,'') ILIKE $1
              OR COALESCE("Telefono",'') ILIKE $1
              ${extra}
           ORDER BY "${t.id}" DESC
           LIMIT 12`,
          [like],
        )
      }
      return rows.map((f) => hitDe(clave, f, 'texto'))
    }),
  )
  for (const b of batches) out.push(...b)
  return out
}
