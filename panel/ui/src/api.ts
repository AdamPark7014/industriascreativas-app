export type Sesion = {
  usuario: string
  nombre: string
  alcance: 'interno' | 'promotor' | string
  puedeOperar: boolean
  puedeImprimir: boolean
}

export type Zona = {
  id: number
  clave: string
  nombre: string
  aforo: number
  dentro: number
  activo: boolean
}

export type Escaneo = {
  id: number
  creado: string
  tipo: string
  registro_id: number
  nombre: string
  modo: 'entrada' | 'salida' | string
  ok: boolean
  mensaje: string
  zona_clave?: string | null
  origen?: string
  operador?: string | null
}

export type Resumen = Sesion & {
  confirmados: number
  dentro: number
  entradasHoy: number
  salidasHoy: number
  rechazosHoy: number
  escaneosHoy: number
  zonas: Zona[]
  recientes: Escaneo[]
}

export type GafeteHit = {
  tipo: string
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
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent('/accesos')}`
    throw new Error('sesion')
  }
  if (!res.ok) {
    let detalle = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) detalle = body.error
    } catch {
      /* ignore */
    }
    throw new Error(detalle)
  }
  return (await res.json()) as T
}

export const api = {
  sesion: () => req<Sesion>('/api/accesos/sesion'),
  resumen: () => req<Resumen>('/api/accesos/resumen'),
  zonas: () => req<{ zonas: Zona[]; puedeOperar: boolean }>('/api/accesos/zonas'),
  guardarZona: (body: { clave: string; nombre: string; aforo: number }) =>
    req<{ ok: boolean; zonas: Zona[] }>('/api/accesos/zonas', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  buscar: (q: string, tipo?: string) => {
    const p = new URLSearchParams({ q })
    if (tipo) p.set('tipo', tipo)
    return req<{ q: string; results: GafeteHit[] }>(`/api/accesos/buscar?${p}`)
  },
  escanear: (qr: string, modo: 'entrada' | 'salida', zona: string) =>
    req<ScanResult>('/api/accesos/escanear', {
      method: 'POST',
      body: JSON.stringify({ qr, modo, zona }),
    }),
  reportes: (params: URLSearchParams) =>
    req<{
      kpis: { total: number; entradas: number; salidas: number; rechazos: number }
      registros: Escaneo[]
      puedeOperar: boolean
    }>(`/api/accesos/reportes?${params}`),
}

export async function imprimirGafete(tipo: string, id: number): Promise<void> {
  const res = await fetch(`/api/accesos/gafete/${tipo}/${id}.pdf`, {
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent('/accesos/buscar')}`
    throw new Error('sesion')
  }
  if (!res.ok) throw new Error('No se pudo generar el gafete')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.src = url
  document.body.appendChild(iframe)
  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => {
      window.setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          resolve()
        } catch {
          const win = window.open(url, '_blank')
          if (!win) reject(new Error('Permite ventanas emergentes para imprimir'))
          else resolve()
        }
      }, 250)
    }
    iframe.onerror = () => reject(new Error('No se abrió el PDF'))
  })
  window.setTimeout(() => {
    iframe.remove()
    URL.revokeObjectURL(url)
  }, 60_000)
}
