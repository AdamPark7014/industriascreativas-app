/**
 * Días del evento FICTI. Dura tres días: cada escaneo, impresión, alta y
 * reenvío se agrupa por el día (hora de Puebla) en que ocurrió, y tanto el
 * estado "dentro / fuera" de una persona como el aforo de cada zona se
 * reinician al cambiar de día.
 *
 * EVENTO_DIAS="2026-10-15,2026-10-16,2026-10-17" en panel/.env (fechas en
 * orden, hora de México). Sin la variable se usan esas tres fechas.
 */
export const TZ = 'America/Mexico_City'

export type DiaEvento = {
  /** 1, 2, 3… en el orden de EVENTO_DIAS. */
  num: number
  /** YYYY-MM-DD en hora de México. */
  fecha: string
  /** "Día 1" */
  etiqueta: string
  /** "mié 15 oct" */
  nombre: string
}

const DIAS_DEFECTO = '2026-10-15,2026-10-16,2026-10-17'

// en-CA imprime YYYY-MM-DD; es-MX da "mié, 15 oct".
const fmtFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const fmtNombre = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const fmtHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Fecha de hoy (o de `d`) en hora de México, YYYY-MM-DD. */
export function fechaCdmx(d: Date = new Date()): string {
  return fmtFecha.format(d)
}

/** "HH:MM:SS" en hora de México; vacío si no hay fecha válida. */
export function horaCdmx(d: Date | string | null | undefined): string {
  if (!d) return ''
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return ''
  return fmtHora.format(x)
}

export function nombreDeFecha(fecha: string): string {
  // Mediodía UTC cae en el mismo día en CDMX (UTC-6 / UTC-5).
  // es-MX da "jue, 15 de oct" → "jue 15 oct" (igual que panel/consultas.py).
  return fmtNombre
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace(/[.,]/g, '')
    .replace(/\bde\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDias(raw: string): DiaEvento[] {
  const fechas = raw
    .split(/[,\s;]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
  const unicas = [...new Set(fechas)].sort()
  return unicas.map((fecha, i) => ({
    num: i + 1,
    fecha,
    etiqueta: `Día ${i + 1}`,
    nombre: nombreDeFecha(fecha),
  }))
}

export const DIAS: DiaEvento[] = (() => {
  const d = parseDias(process.env.EVENTO_DIAS || '')
  return d.length ? d : parseDias(DIAS_DEFECTO)
})()

export function diaDeFecha(fecha: string | null | undefined): DiaEvento | null {
  if (!fecha) return null
  return DIAS.find((d) => d.fecha === fecha) ?? null
}

export function diaActual(): DiaEvento | null {
  return diaDeFecha(fechaCdmx())
}

/** Fecha local (DATE) de una columna timestamptz. Indexable: la zona es constante. */
export const SQL_FECHA = (col: string): string => `(${col} AT TIME ZONE '${TZ}')::date`
export const SQL_FECHA_TXT = (col: string): string =>
  `to_char(${col} AT TIME ZONE '${TZ}', 'YYYY-MM-DD')`
export const SQL_HOY = `(NOW() AT TIME ZONE '${TZ}')::date`
/** `dentro` de accesos_zonas solo vale para el día en que se contó. */
export const SQL_DENTRO_HOY = `CASE WHEN dentro_fecha = ${SQL_HOY} THEN dentro ELSE 0 END`

export type FiltroDia =
  | { modo: 'dia'; dia: DiaEvento; fecha: string }
  | { modo: 'fecha'; fecha: string }
  | { modo: 'todos' }

/**
 * `?dia=` → 1|2|3 (día del evento), `hoy`, `todos` o una fecha YYYY-MM-DD.
 * null = valor inválido (la ruta responde 400).
 */
export function filtroDia(
  param: string | undefined | null,
  defecto: 'hoy' | 'todos' = 'hoy',
): FiltroDia | null {
  const p = (param ?? '').trim().toLowerCase()
  const v = p || defecto
  if (v === 'todos' || v === 'all' || v === '*') return { modo: 'todos' }
  if (v === 'hoy') {
    const fecha = fechaCdmx()
    const dia = diaDeFecha(fecha)
    return dia ? { modo: 'dia', dia, fecha } : { modo: 'fecha', fecha }
  }
  if (/^\d{1,2}$/.test(v)) {
    const dia = DIAS.find((x) => x.num === Number(v))
    return dia ? { modo: 'dia', dia, fecha: dia.fecha } : null
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const dia = diaDeFecha(v)
    return dia ? { modo: 'dia', dia, fecha: v } : { modo: 'fecha', fecha: v }
  }
  return null
}

/** Condición SQL para el filtro; agrega el parámetro a `params`. */
export function condFecha(col: string, filtro: FiltroDia, params: unknown[]): string {
  if (filtro.modo === 'todos') return 'TRUE'
  params.push(filtro.fecha)
  return `${SQL_FECHA(col)} = $${params.length}::date`
}

export function filtroJson(f: FiltroDia) {
  if (f.modo === 'todos') {
    return { modo: 'todos' as const, num: null, fecha: null, etiqueta: 'Todo el evento' }
  }
  if (f.modo === 'dia') {
    return {
      modo: 'dia' as const,
      num: f.dia.num,
      fecha: f.fecha,
      etiqueta: `${f.dia.etiqueta} · ${f.dia.nombre}`,
    }
  }
  return {
    modo: 'fecha' as const,
    num: null,
    fecha: f.fecha,
    etiqueta: `${nombreDeFecha(f.fecha)} · fuera de las fechas del evento`,
  }
}

export function eventoJson() {
  const hoy = diaActual()
  return { tz: TZ, dias: DIAS, hoy: hoy?.num ?? null, fechaHoy: fechaCdmx() }
}

export function diaJson(fecha: string | null | undefined) {
  const d = diaDeFecha(fecha)
  return d ? { num: d.num, etiqueta: d.etiqueta, nombre: d.nombre, fecha: d.fecha } : null
}
