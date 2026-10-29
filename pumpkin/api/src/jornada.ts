import { CORTE_HORA, TZ } from './config.js'

const fmtFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const fmtNombre = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** Jornada (YYYY-MM-DD) a la que pertenece un instante: fecha CDMX corrida CORTE_HORA horas. */
export function jornada(d: Date = new Date()): string {
  return fmtFecha.format(new Date(d.getTime() - CORTE_HORA * 3_600_000))
}

/** "jue 29 oct" para una jornada YYYY-MM-DD. */
export function nombreJornada(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? fecha : fmtNombre.format(d).replace(/\./g, '')
}

export function jornadaJson(fecha = jornada()) {
  return {
    tz: TZ,
    fecha,
    nombre: nombreJornada(fecha),
    corteHora: CORTE_HORA,
  }
}

/** Acepta YYYY-MM-DD; cualquier otra cosa → null. */
export function fechaValida(v: string | undefined | null): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : v
}
