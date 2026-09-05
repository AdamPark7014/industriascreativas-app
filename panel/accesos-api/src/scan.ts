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
import { query, queryOne, type Row } from './db.js'

export type ScanResult = {
  ok: boolean
  mensaje: string
  detalles: string
  pitido: 'exito' | 'error'
  nombre: string
  tipo: string
  asistencias: number
  dentro: boolean
  zona?: string
  zonaNombre?: string
  zonaDentro?: number
  zonaAforo?: number
}

function resultado(
  ok: boolean,
  mensaje: string,
  detalles: string,
  nombre: string,
  tipo: string,
  asistencias: number,
  extra: Record<string, unknown> = {},
): ScanResult {
  return {
    ok,
    mensaje,
    detalles,
    pitido: ok ? 'exito' : 'error',
    nombre,
    tipo,
    asistencias,
    dentro: asistencias > 0,
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
  const res = await client.query(
    `SELECT * FROM "${t.tabla}" WHERE "${t.id}" = $1`,
    [id],
  )
  return (res.rows[0] as Row) ?? null
}

async function logEscaneo(
  client: pg.PoolClient,
  tipo: string | null,
  registroId: number | null,
  nombre: string,
  modo: string,
  ok: boolean,
  mensaje: string,
  zona: string,
  origen: string,
  operador: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO accesos_escaneos
      (tipo, registro_id, nombre, modo, ok, mensaje, zona_clave, origen, operador)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      tipo || 'desconocido',
      registroId || 0,
      (nombre || '').slice(0, 200),
      modo,
      ok,
      (mensaje || '').slice(0, 160),
      zona,
      origen,
      operador,
    ],
  )
}

async function cargarZona(client: pg.PoolClient, clave: string): Promise<Row | null> {
  let r = await client.query(
    `SELECT * FROM accesos_zonas WHERE clave = $1 AND activo`,
    [clave],
  )
  if (!r.rows[0]) {
    r = await client.query(
      `SELECT * FROM accesos_zonas WHERE clave = $1 AND activo`,
      [ZONA_DEFECTO],
    )
  }
  return (r.rows[0] as Row) ?? null
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
  for (const clave of tipos) {
    const fila = await obtener(client, clave, num)
    if (fila) return { clave, fila, id: num }
  }
  return null
}

export async function procesarEscaneo(
  client: pg.PoolClient,
  opts: {
    qr: string
    modo: 'entrada' | 'salida'
    zonaClave: string
    operador: string
    origen: 'panel' | 'demo'
    alcance: string
  },
): Promise<ScanResult> {
  const { qr, modo, zonaClave, operador, origen, alcance } = opts
  const resolved = await resolverRegistro(qr, alcance, client)
  if (!resolved) {
    const res = resultado(
      false,
      origen === 'demo' ? '❌ ACCESO DENEGADO' : 'ACCESO DENEGADO',
      `El código "${qr}" no está registrado.`,
      '',
      '',
      0,
    )
    await logEscaneo(client, null, null, '', modo, false, res.mensaje, zonaClave, origen, operador)
    return res
  }

  const { clave, fila, id } = resolved
  const nombre = nombreDe(fila)
  const etiqueta = TIPOS[clave].etiqueta
  let asistencias = Number(fila.asistencias || 0)
  const t = TIPOS[clave]
  const zona = await cargarZona(client, zonaClave)
  const mz = metaZona(zona)

  if (!fila.confirmado) {
    const res = resultado(
      false,
      origen === 'demo' ? '❌ NO CONFIRMADO' : 'NO CONFIRMADO',
      `${nombre} aún no confirmó su registro por correo.`,
      nombre,
      etiqueta,
      asistencias,
      mz,
    )
    await logEscaneo(client, clave, id, nombre, modo, false, res.mensaje, zonaClave, origen, operador)
    return res
  }

  if (modo === 'salida') {
    if (asistencias <= 0) {
      const res = resultado(
        false,
        origen === 'demo' ? '❌ SALIDA DENEGADA' : 'SALIDA DENEGADA',
        `${nombre} no tiene una entrada activa. No hay reingreso pendiente.`,
        nombre,
        etiqueta,
        asistencias,
        mz,
      )
      await logEscaneo(client, clave, id, nombre, modo, false, res.mensaje, zonaClave, origen, operador)
      return res
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
    const res = resultado(
      true,
      origen === 'demo' ? '✅ SALIDA REGISTRADA' : 'SALIDA REGISTRADA',
      `${nombre} (${etiqueta}). Puede reingresar con ENTRADA.`,
      nombre,
      etiqueta,
      nueva,
      metaZona(zona),
    )
    await logEscaneo(client, clave, id, nombre, modo, true, res.mensaje, zonaClave, origen, operador)
    return res
  }

  // entrada
  if (asistencias >= 1) {
    const res = resultado(
      false,
      origen === 'demo' ? '❌ YA DENTRO' : 'YA DENTRO',
      `${nombre} ya ingresó. Escanea SALIDA antes del reingreso.`,
      nombre,
      etiqueta,
      asistencias,
      mz,
    )
    await logEscaneo(client, clave, id, nombre, modo, false, res.mensaje, zonaClave, origen, operador)
    return res
  }

  if (zona && Number(zona.aforo) > 0 && Number(zona.dentro) >= Number(zona.aforo)) {
    const res = resultado(
      false,
      origen === 'demo' ? '❌ ZONA LLENA' : 'ZONA LLENA',
      `${zona.nombre} está al aforo (${zona.dentro}/${zona.aforo}).`,
      nombre,
      etiqueta,
      asistencias,
      mz,
    )
    await logEscaneo(
      client,
      clave,
      id,
      nombre,
      modo,
      false,
      res.mensaje,
      String(zona.clave),
      origen,
      operador,
    )
    return res
  }

  await client.query(
    `UPDATE "${t.tabla}" SET asistencias = COALESCE(asistencias,0) + 1 WHERE "${t.id}" = $1`,
    [id],
  )
  if (zona) {
    await client.query(`UPDATE accesos_zonas SET dentro = dentro + 1 WHERE clave = $1`, [
      zona.clave,
    ])
    zona.dentro = Number(zona.dentro || 0) + 1
  }
  const res = resultado(
    true,
    origen === 'demo' ? '✅ ENTRADA REGISTRADA' : 'ENTRADA REGISTRADA',
    `${nombre} (${etiqueta})`,
    nombre,
    etiqueta,
    asistencias + 1,
    metaZona(zona),
  )
  await logEscaneo(
    client,
    clave,
    id,
    nombre,
    modo,
    true,
    res.mensaje,
    zona ? String(zona.clave) : zonaClave,
    origen,
    operador,
  )
  return res
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

  // Parallel per-tipo prefix search (uses gin_trgm indexes)
  const batches = await Promise.all(
    tipos.map(async (clave) => {
      const t = TIPOS[clave]
      const extra = t.extra
        ? ` OR CAST("${t.extra}" AS TEXT) ILIKE $1`
        : ''
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
