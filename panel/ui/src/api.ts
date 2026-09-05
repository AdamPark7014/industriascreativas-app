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
  codigo?: string | null
  dispositivo?: string | null
  server_ms?: number | null
  client_ms?: number | null
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
  codigo?: string
  mensaje: string
  detalles: string
  pitido: 'exito' | 'error'
  nombre: string
  tipo: string
  folio?: string
  asistencias: number
  dentro: boolean
  currentlyInside?: boolean
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
  buscar: (q: string, tipo?: string, signal?: AbortSignal) => {
    const p = new URLSearchParams({ q })
    if (tipo) p.set('tipo', tipo)
    return req<{ q: string; results: GafeteHit[] }>(
      `/api/accesos/buscar?${p}`,
      signal ? { signal } : undefined,
    )
  },
  escanear: (
    qr: string,
    modo: 'entrada' | 'salida',
    zona: string,
    extra?: { dispositivo?: string; clientLatencyMs?: number },
  ) =>
    req<ScanResult>('/api/accesos/escanear', {
      method: 'POST',
      body: JSON.stringify({
        qr,
        modo,
        zona,
        dispositivo: extra?.dispositivo,
        clientLatencyMs: extra?.clientLatencyMs,
      }),
    }),
  reportarLatencia: (scanId: number, clientLatencyMs: number) =>
    req<{ ok: boolean }>(`/api/accesos/escaneos/${scanId}/latencia`, {
      method: 'PATCH',
      body: JSON.stringify({ clientLatencyMs }),
    }),
  metricas: () =>
    req<{
      hoy: {
        n: number
        p50: number | null
        p95: number | null
        avg_server: number | null
        avg_client: number | null
      }
      devices: { dispositivo: string; n: number; p50: number | null; ok_rate: number | null }[]
      codigos: { codigo: string; n: number }[]
      puedeOperar: boolean
    }>('/api/accesos/metricas'),
  reportes: (params: URLSearchParams, signal?: AbortSignal) =>
    req<{
      kpis: {
        total: number
        entradas: number
        salidas: number
        rechazos: number
        reingresos?: number
        p50_server?: number | null
        p95_server?: number | null
      }
      registros: Escaneo[]
      zonas?: { clave: string; nombre: string }[]
      dispositivos?: string[]
      puedeOperar: boolean
    }>(`/api/accesos/reportes?${params}`, signal ? { signal } : undefined),
}

export type BoletoPayload = {
  nombre: string
  folio: string
  tipo: string
  subtitulo: string
  evento: string
  formato: string
  qrDataUrl: string
  acento: string
}

export async function cargarBoleto(tipo: string, id: number): Promise<BoletoPayload> {
  return req<BoletoPayload>(`/api/accesos/gafete/${tipo}/${id}`)
}

/** Abre el PDF del gafete (descarga / diálogo de impresión del navegador). */
export async function abrirPdfGafete(tipo: string, id: number): Promise<void> {
  const res = await fetch(`/api/accesos/gafete/${tipo}/${id}.pdf`, {
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent('/accesos/buscar')}`
    throw new Error('sesion')
  }
  if (!res.ok) throw new Error('No se pudo generar el PDF del boleto')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    // Fallback: iframe oculto + print
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
            reject(new Error('Permite ventanas emergentes para abrir el PDF'))
          }
        }, 250)
      }
      iframe.onerror = () => reject(new Error('No se abrió el PDF'))
    })
    window.setTimeout(() => {
      iframe.remove()
      URL.revokeObjectURL(url)
    }, 60_000)
    return
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

/** @deprecated Usar cargarBoleto + preview React; se mantiene alias. */
export const imprimirGafete = abrirPdfGafete
