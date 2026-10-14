import { useCallback, useEffect, useState } from 'react'
import type { DiaParam, EventoInfo } from '../api'

/** Día elegido en pantalla: número de día o todo el evento. */
export type DiaSel = number | 'todos'

const KEY = 'ficti_dia_sel'

function leer(): DiaSel | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === 'todos') return 'todos'
    const n = Number(raw)
    return raw && Number.isInteger(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/** Sin elección del operador: hoy si es día del evento; si no, todo el evento (o el último día). */
export function diaPorDefecto(evento: EventoInfo | null | undefined, conTodos: boolean): DiaSel {
  if (!evento) return conTodos ? 'todos' : 1
  if (evento.hoy) return evento.hoy
  if (conTodos) return 'todos'
  return evento.dias[evento.dias.length - 1]?.num ?? 1
}

/**
 * Día seleccionado en las pantallas con selector. Se recuerda en la pestaña
 * (sessionStorage) para que Resumen, Informes y Mesa muestren el mismo día.
 */
export function useDiaSeleccionado(
  evento: EventoInfo | null | undefined,
  opts: { conTodos?: boolean } = {},
): [DiaSel, (d: DiaSel) => void, DiaParam] {
  const conTodos = opts.conTodos ?? true
  const [elegido, setElegido] = useState<DiaSel | null>(leer)

  // Si el operador había elegido "todos" en una pantalla que no lo admite, cae al defecto.
  const dia: DiaSel =
    elegido == null || (elegido === 'todos' && !conTodos)
      ? diaPorDefecto(evento, conTodos)
      : evento && typeof elegido === 'number' && !evento.dias.some((d) => d.num === elegido)
        ? diaPorDefecto(evento, conTodos)
        : elegido

  const elegir = useCallback((d: DiaSel) => {
    setElegido(d)
    try {
      sessionStorage.setItem(KEY, String(d))
    } catch {
      /* sin almacenamiento: solo en memoria */
    }
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setElegido(leer())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const param: DiaParam = dia === 'todos' ? 'todos' : dia
  return [dia, elegir, param]
}

const fmtFechaCdmx = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** YYYY-MM-DD en hora de México de un ISO; '' si no es fecha. */
export function fechaCdmx(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : fmtFechaCdmx.format(d)
}

/** "Día 2" del escaneo según su fecha local, o "Fuera" si no cae en el evento. */
export function etiquetaDiaDe(evento: EventoInfo | null | undefined, iso: string | null | undefined): string {
  const f = fechaCdmx(iso)
  if (!f) return ''
  return evento?.dias.find((d) => d.fecha === f)?.etiqueta ?? 'Fuera'
}

/** "Día 2 · jue 16 oct" para un número de día, o "Todo el evento". */
export function nombreDia(evento: EventoInfo | null | undefined, dia: DiaSel): string {
  if (dia === 'todos') return 'Todo el evento'
  const d = evento?.dias.find((x) => x.num === dia)
  return d ? `${d.etiqueta} · ${d.nombre}` : `Día ${dia}`
}
