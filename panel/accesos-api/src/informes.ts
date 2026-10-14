/**
 * Exportación del historial de accesos (CSV y Excel) separada por día del evento.
 *
 * El Excel trae: "Resumen" (totales por día), una hoja por día con cada escaneo
 * en hora de México, "Otros días" si hubo escaneos fuera de las fechas del
 * evento y "Asistentes" (una fila por persona con su primera entrada, última
 * salida y accesos de cada día).
 */
import ExcelJS from 'exceljs'
import { TIPOS, folioDe, type TipoClave } from './catalog.js'
import { DIAS, diaDeFecha, fechaCdmx, horaCdmx, nombreDeFecha, type FiltroDia } from './evento.js'

export type FilaEscaneo = {
  id: number
  creado: string | null
  tipo: string
  registro_id: number
  nombre: string
  modo: string
  ok: boolean
  mensaje: string
  zona_clave: string | null
  origen: string | null
  operador: string | null
  codigo: string | null
  dispositivo: string | null
  server_ms: number | null
  client_ms: number | null
}

export type FilaAsistente = {
  tipo: string
  registro_id: number
  nombre: string
  /** YYYY-MM-DD en hora de México. */
  fecha: string
  primera_entrada: Date | string | null
  ultima_salida: Date | string | null
  entradas: number
}

const NAVY = 'FF071A3A'
const GRIS = 'FFF5F7FB'
const VERDE = 'FF1B7A45'
const ROJO = 'FFC62828'
const BLANCO = 'FFFFFFFF'

function fechaDe(creado: string | null): string {
  if (!creado) return ''
  const d = new Date(creado)
  return Number.isNaN(d.getTime()) ? '' : fechaCdmx(d)
}

/** "Día 2" · "Fuera de fechas" · "" */
export function etiquetaDia(fecha: string): string {
  if (!fecha) return ''
  return diaDeFecha(fecha)?.etiqueta ?? 'Fuera de fechas'
}

function tipoEtiqueta(tipo: string): string {
  return TIPOS[tipo as TipoClave]?.etiqueta ?? tipo
}

function folio(tipo: string, id: number): string {
  return TIPOS[tipo as TipoClave] ? folioDe(tipo as TipoClave, id) : String(id)
}

function esRechazo(r: FilaEscaneo): boolean {
  // El cooldown es el mismo boleto leído dos veces seguidas: ruido del lector, no un rechazo.
  return !r.ok && (r.codigo || '') !== 'COOLDOWN'
}

// ------------------------------------------------------------------ CSV

export function csvEscaneos(registros: FilaEscaneo[]): string {
  const header =
    'fecha,hora,dia,ok,codigo,modo,nombre,tipo,folio,zona,mensaje,origen,operador,dispositivo,server_ms,client_ms\n'
  const lines = registros.map((r) => {
    const fecha = fechaDe(r.creado)
    return [
      fecha,
      horaCdmx(r.creado),
      etiquetaDia(fecha),
      r.ok,
      r.codigo,
      r.modo,
      r.nombre,
      tipoEtiqueta(r.tipo),
      folio(r.tipo, r.registro_id),
      r.zona_clave,
      r.mensaje,
      r.origen,
      r.operador,
      r.dispositivo,
      r.server_ms,
      r.client_ms,
    ]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  })
  return '﻿' + header + lines.join('\n')
}

// ------------------------------------------------------------------ Excel

function encabezado(ws: ExcelJS.Worksheet, fila: number, textos: string[], anchos?: number[]): void {
  const row = ws.getRow(fila)
  textos.forEach((t, i) => {
    const c = row.getCell(i + 1)
    c.value = t
    c.font = { bold: true, color: { argb: BLANCO }, size: 10 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', wrapText: true }
    if (anchos?.[i]) ws.getColumn(i + 1).width = anchos[i]
  })
  row.height = 24
  ws.views = [{ state: 'frozen', ySplit: fila }]
  ws.autoFilter = { from: { row: fila, column: 1 }, to: { row: fila, column: textos.length } }
}

function titulo(ws: ExcelJS.Worksheet, texto: string, sub: string): void {
  ws.getCell('A1').value = texto
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: NAVY } }
  ws.getCell('A2').value = sub
  ws.getCell('A2').font = { size: 9, color: { argb: 'FF5B6B82' } }
}

type Totales = {
  entradas: number
  salidas: number
  reingresos: number
  rechazos: number
  unicos: Set<string>
}

function totalesVacios(): Totales {
  return { entradas: 0, salidas: 0, reingresos: 0, rechazos: 0, unicos: new Set() }
}

function acumular(t: Totales, r: FilaEscaneo): void {
  if (r.ok && r.modo === 'entrada') {
    t.entradas += 1
    t.unicos.add(`${r.tipo}:${r.registro_id}`)
  }
  if (r.ok && r.modo === 'salida') t.salidas += 1
  if (r.ok && r.codigo === 'OK_REENTRY') t.reingresos += 1
  if (esRechazo(r)) t.rechazos += 1
}

function hojaEscaneos(wb: ExcelJS.Workbook, nombre: string, sub: string, filas: FilaEscaneo[]): void {
  const ws = wb.addWorksheet(nombre.slice(0, 31))
  titulo(ws, nombre, sub)
  const enc = 4
  encabezado(
    ws,
    enc,
    [
      'Fecha', 'Hora', 'Día', 'Resultado', 'Código', 'Movimiento', 'Nombre', 'Tipo', 'Folio',
      'Zona', 'Mensaje', 'Origen', 'Operador', 'Estación', 'ms servidor', 'ms cliente',
    ],
    [11, 9, 9, 11, 16, 11, 34, 11, 16, 13, 48, 8, 12, 18, 10, 10],
  )
  // De más antiguo a más reciente: así se lee como bitácora del día.
  const orden = [...filas].sort((a, b) => String(a.creado).localeCompare(String(b.creado)))
  orden.forEach((r, i) => {
    const fecha = fechaDe(r.creado)
    const row = ws.getRow(enc + 1 + i)
    row.values = [
      fecha,
      horaCdmx(r.creado),
      etiquetaDia(fecha),
      r.ok ? 'OK' : (r.codigo || '') === 'COOLDOWN' ? 'Duplicado' : 'Rechazado',
      r.codigo ?? '',
      r.modo === 'entrada' ? 'Entrada' : r.modo === 'salida' ? 'Salida' : r.modo,
      r.nombre,
      tipoEtiqueta(r.tipo),
      folio(r.tipo, r.registro_id),
      r.zona_clave ?? '',
      r.mensaje,
      r.origen ?? '',
      r.operador ?? '',
      r.dispositivo ?? '',
      r.server_ms ?? null,
      r.client_ms ?? null,
    ]
    const res = row.getCell(4)
    res.font = { bold: true, color: { argb: r.ok ? VERDE : ROJO } }
    if (i % 2) row.eachCell({ includeEmpty: true }, (c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }
    })
  })
}

export async function xlsxEscaneos(opts: {
  registros: FilaEscaneo[]
  asistentes: FilaAsistente[]
  filtro: FiltroDia
  generado: string
}): Promise<ArrayBuffer> {
  const { registros, asistentes, filtro, generado } = opts
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Panel de control · panel.experiencebt.com.mx'
  wb.created = new Date()

  // Agrupar por fecha local.
  const porFecha = new Map<string, FilaEscaneo[]>()
  for (const r of registros) {
    const f = fechaDe(r.creado)
    const arr = porFecha.get(f) ?? []
    arr.push(r)
    porFecha.set(f, arr)
  }

  // Días a mostrar: los del evento (aunque vacíos) cuando es "todos"; solo el pedido si no.
  const fechasEvento =
    filtro.modo === 'todos' ? DIAS.map((d) => d.fecha) : [filtro.fecha]
  const fechasOtras = [...porFecha.keys()].filter((f) => f && !fechasEvento.includes(f)).sort()

  // --- Resumen
  const res = wb.addWorksheet('Resumen')
  titulo(res, 'Accesos FICTI · resumen por día', `Generado el ${generado} (hora de México)`)
  encabezado(
    res,
    4,
    ['Día', 'Fecha', 'Entradas', 'Salidas', 'Reingresos', 'Rechazos', 'Personas distintas'],
    [16, 16, 12, 12, 12, 12, 18],
  )
  const total = totalesVacios()
  let fila = 5
  const escribirTotales = (etq: string, fecha: string, t: Totales) => {
    const row = res.getRow(fila++)
    row.values = [etq, fecha ? `${fecha} · ${nombreDeFecha(fecha)}` : '', t.entradas, t.salidas, t.reingresos, t.rechazos, t.unicos.size]
    for (const k of ['entradas', 'salidas', 'reingresos', 'rechazos'] as const) total[k] += t[k]
    for (const u of t.unicos) total.unicos.add(u)
  }
  for (const f of fechasEvento) {
    const t = totalesVacios()
    for (const r of porFecha.get(f) ?? []) acumular(t, r)
    escribirTotales(diaDeFecha(f)?.etiqueta ?? 'Día', f, t)
  }
  for (const f of fechasOtras) {
    const t = totalesVacios()
    for (const r of porFecha.get(f) ?? []) acumular(t, r)
    escribirTotales('Fuera de fechas', f, t)
  }
  const rowTotal = res.getRow(fila)
  rowTotal.values = ['Total', '', total.entradas, total.salidas, total.reingresos, total.rechazos, total.unicos.size]
  rowTotal.font = { bold: true }
  res.getCell(fila + 2, 1).value =
    'Reingreso = volvió a entrar el mismo día tras una salida. Personas distintas = boletos con al menos una entrada aceptada ese día. Los duplicados por lector (COOLDOWN) no cuentan como rechazo.'
  res.getCell(fila + 2, 1).font = { size: 9, italic: true, color: { argb: 'FF5B6B82' } }

  // --- Una hoja por día
  for (const f of fechasEvento) {
    const d = diaDeFecha(f)
    const filas = porFecha.get(f) ?? []
    hojaEscaneos(
      wb,
      d ? `${d.etiqueta} · ${d.nombre}` : nombreDeFecha(f),
      `${f} · ${filas.length} escaneos · hora de México`,
      filas,
    )
  }
  if (fechasOtras.length) {
    const filas = fechasOtras.flatMap((f) => porFecha.get(f) ?? [])
    hojaEscaneos(wb, 'Otros días', `Escaneos fuera de las fechas del evento · ${filas.length}`, filas)
  }

  // --- Asistentes (una fila por persona, columnas por día)
  const ws = wb.addWorksheet('Asistentes')
  titulo(ws, 'Asistentes por día', 'Primera entrada y última salida de cada persona, en hora de México')
  const columnasDia = fechasEvento.map((f) => ({ fecha: f, etq: diaDeFecha(f)?.etiqueta ?? nombreDeFecha(f) }))
  const cab = ['Tipo', 'Folio', 'Nombre']
  const anchos = [11, 16, 36]
  for (const c of columnasDia) {
    cab.push(`${c.etq} · 1.ª entrada`, `${c.etq} · última salida`, `${c.etq} · accesos`)
    anchos.push(16, 16, 10)
  }
  cab.push('Días asistidos', 'Accesos totales')
  anchos.push(13, 13)
  encabezado(ws, 4, cab, anchos)

  type Persona = { tipo: string; id: number; nombre: string; dias: Map<string, FilaAsistente> }
  const personas = new Map<string, Persona>()
  for (const a of asistentes) {
    if (!fechasEvento.includes(a.fecha)) continue
    const k = `${a.tipo}:${a.registro_id}`
    let p = personas.get(k)
    if (!p) {
      p = { tipo: a.tipo, id: Number(a.registro_id), nombre: a.nombre, dias: new Map() }
      personas.set(k, p)
    }
    if (a.nombre && !p.nombre) p.nombre = a.nombre
    p.dias.set(a.fecha, a)
  }
  const lista = [...personas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  lista.forEach((p, i) => {
    const row = ws.getRow(5 + i)
    const vals: (string | number)[] = [tipoEtiqueta(p.tipo), folio(p.tipo, p.id), p.nombre]
    let diasAsistidos = 0
    let accesos = 0
    for (const c of columnasDia) {
      const a = p.dias.get(c.fecha)
      if (a && a.entradas > 0) {
        diasAsistidos += 1
        accesos += a.entradas
      }
      vals.push(a ? horaCdmx(a.primera_entrada) : '', a ? horaCdmx(a.ultima_salida) : '', a?.entradas ?? 0)
    }
    vals.push(diasAsistidos, accesos)
    row.values = vals
    if (i % 2) row.eachCell({ includeEmpty: true }, (c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  // Copia a un ArrayBuffer propio: `Response` no acepta el Buffer de Node tal cual.
  const copia = new Uint8Array(buf)
  return copia.buffer
}

/** accesos-ficti-dia1-2026-10-15.xlsx · accesos-ficti-todo.xlsx */
export function nombreArchivo(filtro: FiltroDia, ext: 'csv' | 'xlsx'): string {
  if (filtro.modo === 'todos') return `accesos-ficti-todo.${ext}`
  if (filtro.modo === 'dia') return `accesos-ficti-dia${filtro.dia.num}-${filtro.fecha}.${ext}`
  return `accesos-ficti-${filtro.fecha}.${ext}`
}
