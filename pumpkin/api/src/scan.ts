import type pg from 'pg'
import { AFORO, SCAN_COOLDOWN_MS } from './config.js'
import { normalizarCodigo } from './codigo.js'
import { enTransaccion } from './db.js'
import { jornada } from './jornada.js'

/** Mismos códigos que FICTI (panel/accesos-api/src/codes.ts) para que el escáner los lea igual. */
export const CODIGOS = {
  OK_ENTRY: 'OK_ENTRY',
  OK_EXIT: 'OK_EXIT',
  OK_REENTRY: 'OK_REENTRY',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_QR: 'INVALID_QR',
  BLACKLISTED: 'BLACKLISTED',
  ALREADY_INSIDE: 'ALREADY_INSIDE',
  NOT_INSIDE: 'NOT_INSIDE',
  ZONE_FULL: 'ZONE_FULL',
  COOLDOWN: 'COOLDOWN',
} as const

export type Codigo = (typeof CODIGOS)[keyof typeof CODIGOS]

export const ZONA_NOMBRE = 'Acceso PUMPKIN'
export const TIPO_PASE = 'Pase PUMPKIN'

export type ScanResult = {
  ok: boolean
  codigo: Codigo
  mensaje: string
  detalles: string
  pitido: 'exito' | 'error'
  nombre: string
  tipo: string
  folio?: string
  asistencias: number
  dentro: boolean
  currentlyInside: boolean
  reentry?: boolean
  entradasHoy?: number
  zonaNombre: string
  zonaDentro: number
  zonaAforo: number
  jornada: string
  scanId?: number
  serverMs?: number
  dispositivo?: string
}

export type ScanOpts = {
  leido: string
  modo: 'entrada' | 'salida'
  operador: string
  dispositivo?: string
  origen: 'lector' | 'camara' | 'offline'
  /** Hora en que la PDA leyó el código (escaneos que esperaron en la cola sin red). */
  leidoEn?: Date | null
  startedAt: number
}

const recientes = new Map<string, number>()

function podarRecientes(ahora: number): void {
  if (recientes.size < 400) return
  for (const [k, at] of recientes) if (ahora - at > SCAN_COOLDOWN_MS * 4) recientes.delete(k)
}

const fmtHora = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function hora(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? '' : fmtHora.format(d)
}

/** Pases cuya última lectura aceptada de la jornada fue una entrada. */
async function contarDentro(c: pg.PoolClient, hoy: string): Promise<number> {
  const r = await c.query(
    `SELECT count(*)::int AS n FROM (
       SELECT DISTINCT ON (pase_id) modo FROM escaneos
       WHERE ok AND jornada = $1::date ORDER BY pase_id, id DESC
     ) s WHERE modo = 'entrada'`,
    [hoy],
  )
  return Number(r.rows[0]?.n || 0)
}

export async function procesarEscaneo(o: ScanOpts): Promise<ScanResult> {
  const hoy = jornada()
  const dispositivo = (o.dispositivo || '').trim().slice(0, 60) || null
  const codigoPase = normalizarCodigo(o.leido)

  return enTransaccion(async (c) => {
    const base = {
      nombre: '',
      tipo: '',
      asistencias: 0,
      dentro: false,
      currentlyInside: false,
      zonaNombre: ZONA_NOMBRE,
      zonaDentro: 0,
      zonaAforo: AFORO,
      jornada: hoy,
    }

    const cerrar = async (
      res: Omit<ScanResult, 'pitido' | 'scanId' | 'serverMs'>,
      paseId: number | null,
    ): Promise<ScanResult> => {
      const r = await c.query(
        `INSERT INTO escaneos
           (jornada, pase_id, leido, modo, ok, codigo, mensaje, reingreso, operador, dispositivo,
            origen, server_ms, leido_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          hoy,
          paseId,
          o.leido.slice(0, 120),
          o.modo,
          res.ok,
          res.codigo,
          res.mensaje.slice(0, 160),
          Boolean(res.reentry),
          o.operador,
          dispositivo,
          o.origen,
          Math.max(0, Math.round(Date.now() - o.startedAt)),
          o.leidoEn ?? null,
        ],
      )
      return {
        ...res,
        pitido: res.ok ? 'exito' : 'error',
        scanId: Number(r.rows[0]?.id),
        serverMs: Math.max(0, Math.round(Date.now() - o.startedAt)),
        dispositivo: dispositivo || undefined,
      }
    }

    if (!codigoPase) {
      return cerrar(
        {
          ...base,
          ok: false,
          codigo: CODIGOS.INVALID_QR,
          mensaje: 'QR NO VÁLIDO',
          detalles: `Lo leído («${o.leido.trim().slice(0, 40)}») no es un pase PUMPKIN.`,
        },
        null,
      )
    }

    // El lector USB/PDA a veces dispara dos veces: la segunda lectura no cuenta.
    const ahora = Date.now()
    podarRecientes(ahora)
    const llave = `${codigoPase}|${o.modo}`
    const previo = recientes.get(llave)
    recientes.set(llave, ahora)
    if (previo != null && ahora - previo < SCAN_COOLDOWN_MS) {
      return cerrar(
        {
          ...base,
          ok: false,
          codigo: CODIGOS.COOLDOWN,
          mensaje: 'DUPLICADO',
          detalles: `Escaneo repetido en menos de ${SCAN_COOLDOWN_MS} ms. Espera un instante.`,
        },
        null,
      )
    }

    // Con aforo, las entradas se forman una tras otra para no pasarse del cupo.
    if (o.modo === 'entrada' && AFORO > 0) await c.query('SELECT pg_advisory_xact_lock(7014250)')

    // FOR UPDATE: dos PDA con el mismo pase al mismo tiempo se validan en orden.
    const pr = await c.query(
      'SELECT id, codigo, titular, bloqueado, bloqueo_motivo FROM pases WHERE codigo = $1 FOR UPDATE',
      [codigoPase],
    )
    const pase = pr.rows[0] as
      | { id: number; codigo: string; titular: string | null; bloqueado: boolean; bloqueo_motivo: string | null }
      | undefined

    if (!pase) {
      return cerrar(
        {
          ...base,
          ok: false,
          codigo: CODIGOS.NOT_FOUND,
          mensaje: 'ACCESO DENEGADO',
          detalles: `El código ${codigoPase} no pertenece al lote PUMPKIN.`,
        },
        null,
      )
    }

    const er = await c.query(
      `SELECT
         (SELECT modo FROM escaneos WHERE pase_id = $1 AND ok AND jornada = $2::date
           ORDER BY id DESC LIMIT 1) AS ultimo_modo,
         (SELECT creado FROM escaneos WHERE pase_id = $1 AND ok AND jornada = $2::date
           ORDER BY id DESC LIMIT 1) AS ultimo_at,
         (SELECT count(*)::int FROM escaneos WHERE pase_id = $1 AND ok AND modo = 'entrada'
           AND jornada = $2::date) AS entradas_hoy,
         (SELECT count(*)::int FROM escaneos WHERE pase_id = $1 AND ok AND modo = 'entrada') AS entradas_total`,
      [pase.id, hoy],
    )
    const e = er.rows[0] ?? {}
    const dentro = e.ultimo_modo === 'entrada'
    const entradasHoy = Number(e.entradas_hoy || 0)
    const entradasTotal = Number(e.entradas_total || 0)
    const zonaDentro = await contarDentro(c, hoy)

    const etiqueta = pase.titular ? `${pase.titular} (${pase.codigo})` : pase.codigo
    const persona = {
      ...base,
      nombre: pase.titular || pase.codigo,
      tipo: TIPO_PASE,
      folio: pase.titular ? pase.codigo : undefined,
      asistencias: entradasTotal,
      dentro,
      currentlyInside: dentro,
      entradasHoy,
      zonaDentro,
    }

    if (pase.bloqueado) {
      return cerrar(
        {
          ...persona,
          ok: false,
          codigo: CODIGOS.BLACKLISTED,
          mensaje: 'PASE BLOQUEADO',
          detalles: `${etiqueta}: ${pase.bloqueo_motivo || 'bloqueado por supervisión'}.`,
        },
        pase.id,
      )
    }

    if (o.modo === 'salida') {
      if (!dentro) {
        return cerrar(
          {
            ...persona,
            ok: false,
            codigo: CODIGOS.NOT_INSIDE,
            mensaje: 'SALIDA DENEGADA',
            detalles:
              e.ultimo_modo === 'salida'
                ? `${etiqueta} ya registró su salida a las ${hora(e.ultimo_at)}. Para volver a entrar escanea ENTRADA.`
                : `${etiqueta} no tiene una entrada registrada en esta jornada.`,
          },
          pase.id,
        )
      }
      const quedan = Math.max(0, zonaDentro - 1)
      return cerrar(
        {
          ...persona,
          ok: true,
          codigo: CODIGOS.OK_EXIT,
          mensaje: 'SALIDA REGISTRADA',
          detalles: `${etiqueta}. Puede reingresar con ENTRADA.`,
          dentro: false,
          currentlyInside: false,
          zonaDentro: quedan,
        },
        pase.id,
      )
    }

    if (dentro) {
      return cerrar(
        {
          ...persona,
          ok: false,
          codigo: CODIGOS.ALREADY_INSIDE,
          mensaje: 'YA DENTRO',
          detalles: `${etiqueta} ya ingresó a las ${hora(e.ultimo_at)}. Escanea SALIDA antes del reingreso.`,
        },
        pase.id,
      )
    }

    if (AFORO > 0 && zonaDentro >= AFORO) {
      return cerrar(
        {
          ...persona,
          ok: false,
          codigo: CODIGOS.ZONE_FULL,
          mensaje: 'AFORO LLENO',
          detalles: `Hay ${zonaDentro}/${AFORO} dentro. Espera a que salga alguien.`,
        },
        pase.id,
      )
    }

    const reentry = entradasHoy > 0
    return cerrar(
      {
        ...persona,
        ok: true,
        codigo: reentry ? CODIGOS.OK_REENTRY : CODIGOS.OK_ENTRY,
        mensaje: reentry ? 'REINGRESO' : 'ENTRADA REGISTRADA',
        detalles: reentry
          ? `${etiqueta} · reingreso (entrada n.º ${entradasHoy + 1} de la jornada)`
          : `${etiqueta} · primera entrada de la jornada`,
        reentry,
        dentro: true,
        currentlyInside: true,
        asistencias: entradasTotal + 1,
        entradasHoy: entradasHoy + 1,
        zonaDentro: zonaDentro + 1,
      },
      pase.id,
    )
  })
}
