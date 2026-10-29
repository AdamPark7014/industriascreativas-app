import { AFORO, TOTAL_PASES } from './config.js'
import { pool, query, queryOne } from './db.js'
import { jornadaJson, nombreJornada } from './jornada.js'

const SQL_DENTRO = `
  SELECT count(*)::int AS n FROM (
    SELECT DISTINCT ON (pase_id) modo FROM escaneos
    WHERE ok AND jornada = $1::date ORDER BY pase_id, id DESC
  ) s WHERE modo = 'entrada'`

export async function resumen(fecha: string) {
  const [tot, dentro, pases, porOperador, recientes, jornadas, porHora] = await Promise.all([
    queryOne<Record<string, number>>(
      `SELECT
         count(*) FILTER (WHERE ok AND modo = 'entrada')::int AS entradas,
         count(*) FILTER (WHERE ok AND modo = 'entrada' AND reingreso)::int AS reingresos,
         count(*) FILTER (WHERE ok AND modo = 'salida')::int AS salidas,
         count(*) FILTER (WHERE NOT ok AND codigo <> 'COOLDOWN')::int AS rechazos,
         count(DISTINCT pase_id) FILTER (WHERE ok AND modo = 'entrada')::int AS unicos
       FROM escaneos WHERE jornada = $1::date`,
      [fecha],
    ),
    queryOne<{ n: number }>(SQL_DENTRO, [fecha]),
    queryOne<{ total: number; bloqueados: number; con_titular: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE bloqueado)::int AS bloqueados,
              count(*) FILTER (WHERE titular IS NOT NULL AND titular <> '')::int AS con_titular
       FROM pases`,
    ),
    query(
      `SELECT COALESCE(e.operador, '—') AS operador,
              u.nombre,
              count(*) FILTER (WHERE e.ok AND e.modo = 'entrada' AND NOT e.reingreso)::int AS entradas,
              count(*) FILTER (WHERE e.ok AND e.modo = 'entrada' AND e.reingreso)::int AS reingresos,
              count(*) FILTER (WHERE e.ok AND e.modo = 'salida')::int AS salidas,
              count(*) FILTER (WHERE NOT e.ok AND e.codigo <> 'COOLDOWN')::int AS rechazos,
              max(e.creado) AS ultimo,
              (array_agg(e.dispositivo ORDER BY e.id DESC))[1] AS dispositivo
       FROM escaneos e LEFT JOIN usuarios u ON u.usuario = e.operador
       WHERE e.jornada = $1::date
       GROUP BY e.operador, u.nombre
       ORDER BY e.operador`,
      [fecha],
    ),
    query(
      `SELECT e.id, e.creado, e.modo, e.ok, e.codigo, e.mensaje, e.reingreso, e.operador,
              e.dispositivo, e.leido, p.codigo AS pase, p.titular
       FROM escaneos e LEFT JOIN pases p ON p.id = e.pase_id
       WHERE e.jornada = $1::date
       ORDER BY e.id DESC LIMIT 25`,
      [fecha],
    ),
    query<{ jornada: string; entradas: number; escaneos: number }>(
      `SELECT to_char(jornada, 'YYYY-MM-DD') AS jornada,
              count(*) FILTER (WHERE ok AND modo = 'entrada')::int AS entradas,
              count(*)::int AS escaneos
       FROM escaneos GROUP BY jornada ORDER BY jornada DESC LIMIT 60`,
    ),
    query<{ hora: number; entradas: number; salidas: number }>(
      `SELECT extract(hour FROM creado AT TIME ZONE 'America/Mexico_City')::int AS hora,
              count(*) FILTER (WHERE ok AND modo = 'entrada')::int AS entradas,
              count(*) FILTER (WHERE ok AND modo = 'salida')::int AS salidas
       FROM escaneos WHERE jornada = $1::date AND ok
       GROUP BY 1 ORDER BY 1`,
      [fecha],
    ),
  ])
  return {
    jornada: jornadaJson(fecha),
    jornadas: jornadas.map((j) => ({ ...j, nombre: nombreJornada(j.jornada) })),
    aforo: AFORO,
    dentro: dentro?.n ?? 0,
    entradas: tot?.entradas ?? 0,
    reingresos: tot?.reingresos ?? 0,
    salidas: tot?.salidas ?? 0,
    rechazos: tot?.rechazos ?? 0,
    unicos: tot?.unicos ?? 0,
    pases: {
      total: pases?.total ?? TOTAL_PASES,
      bloqueados: pases?.bloqueados ?? 0,
      conTitular: pases?.con_titular ?? 0,
    },
    porOperador,
    porHora,
    recientes,
  }
}

export type EstadoPase = 'dentro' | 'salio' | 'sin_entrar'

export async function listarPases(fecha: string) {
  const filas = await query<Record<string, unknown>>(
    `WITH ult AS (
       SELECT DISTINCT ON (pase_id) pase_id, modo, creado, operador
       FROM escaneos WHERE ok AND jornada = $1::date ORDER BY pase_id, id DESC
     ), ent AS (
       SELECT pase_id,
              count(*) FILTER (WHERE jornada = $1::date)::int AS hoy,
              count(*)::int AS total,
              max(creado) AS ultima
       FROM escaneos WHERE ok AND modo = 'entrada' GROUP BY pase_id
     )
     SELECT p.codigo, p.numero, p.hoja, p.titular, p.bloqueado, p.bloqueo_motivo,
            ult.modo AS ultimo_modo, ult.creado AS ultimo_at, ult.operador AS ultimo_operador,
            COALESCE(ent.hoy, 0) AS entradas_hoy, COALESCE(ent.total, 0) AS entradas_total,
            ent.ultima AS ultima_entrada
     FROM pases p
     LEFT JOIN ult ON ult.pase_id = p.id
     LEFT JOIN ent ON ent.pase_id = p.id
     ORDER BY p.numero`,
    [fecha],
  )
  return filas.map((f) => ({
    codigo: String(f.codigo),
    numero: Number(f.numero),
    hoja: Number(f.hoja),
    titular: (f.titular as string | null) || '',
    bloqueado: Boolean(f.bloqueado),
    motivo: (f.bloqueo_motivo as string | null) || '',
    estado: (f.ultimo_modo === 'entrada' ? 'dentro' : f.ultimo_modo === 'salida' ? 'salio' : 'sin_entrar') as EstadoPase,
    ultimoAt: f.ultimo_at ?? null,
    ultimoOperador: (f.ultimo_operador as string | null) || '',
    entradasHoy: Number(f.entradas_hoy || 0),
    entradasTotal: Number(f.entradas_total || 0),
    ultimaEntrada: f.ultima_entrada ?? null,
  }))
}

export async function actualizarPase(
  codigo: string,
  cambios: { titular?: string | null; bloqueado?: boolean; motivo?: string | null },
) {
  const r = await pool.query(
    `UPDATE pases SET
       titular = CASE WHEN $2::boolean THEN NULLIF(btrim($3::text), '') ELSE titular END,
       bloqueado = COALESCE($4::boolean, bloqueado),
       bloqueo_motivo = CASE
         WHEN $4::boolean IS FALSE THEN NULL
         WHEN $5::boolean THEN NULLIF(btrim($6::text), '')
         ELSE bloqueo_motivo END,
       actualizado = now()
     WHERE codigo = $1
     RETURNING codigo, titular, bloqueado, bloqueo_motivo`,
    [
      codigo,
      cambios.titular !== undefined,
      (cambios.titular ?? '').slice(0, 120),
      cambios.bloqueado ?? null,
      cambios.motivo !== undefined,
      (cambios.motivo ?? '').slice(0, 160),
    ],
  )
  return r.rows[0] ?? null
}

export type FiltroEscaneos = {
  fecha: string | null
  operador?: string
  resultado?: 'ok' | 'rechazo' | 'todos'
  pase?: string
  limite: number
}

export async function listarEscaneos(f: FiltroEscaneos) {
  const cond: string[] = []
  const params: unknown[] = []
  if (f.fecha) {
    params.push(f.fecha)
    cond.push(`e.jornada = $${params.length}::date`)
  }
  if (f.operador) {
    params.push(f.operador)
    cond.push(`e.operador = $${params.length}`)
  }
  if (f.pase) {
    params.push(f.pase)
    cond.push(`p.codigo = $${params.length}`)
  }
  if (f.resultado === 'ok') cond.push('e.ok')
  if (f.resultado === 'rechazo') cond.push(`NOT e.ok AND e.codigo <> 'COOLDOWN'`)
  params.push(f.limite)
  return query<Record<string, unknown>>(
    `SELECT e.id, e.creado, to_char(e.jornada, 'YYYY-MM-DD') AS jornada, e.modo, e.ok, e.codigo,
            e.mensaje, e.reingreso, e.operador, e.dispositivo, e.origen, e.leido, e.leido_en,
            p.codigo AS pase, p.titular
     FROM escaneos e LEFT JOIN pases p ON p.id = e.pase_id
     ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
     ORDER BY e.id DESC
     LIMIT $${params.length}`,
    params,
  )
}

const fmtCsv = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function celda(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV con BOM para que Excel respete los acentos. */
export function escaneosCsv(filas: Record<string, unknown>[]): string {
  const cab = [
    'fecha_hora', 'jornada', 'pase', 'titular', 'modo', 'resultado', 'aceptado', 'reingreso',
    'mensaje', 'usuario', 'dispositivo', 'origen', 'leido',
  ]
  const lineas = filas.map((f) =>
    [
      fmtCsv.format(new Date(String(f.creado))),
      f.jornada,
      f.pase ?? '',
      f.titular ?? '',
      f.modo,
      f.codigo,
      f.ok ? 'sí' : 'no',
      f.reingreso ? 'sí' : 'no',
      f.mensaje,
      f.operador ?? '',
      f.dispositivo ?? '',
      f.origen,
      f.leido,
    ]
      .map(celda)
      .join(','),
  )
  return `﻿${cab.join(',')}\r\n${lineas.join('\r\n')}\r\n`
}
