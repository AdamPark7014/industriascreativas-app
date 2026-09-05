import { useCallback, useEffect, useRef, useState } from 'react'
import CameraScan from '../components/CameraScan'
import { getDeviceId, setDeviceId } from '../lib/deviceId'
import { enqueueScan, flushQueue, readQueue } from '../lib/offlineQueue'
import styles from '../styles/escanear.module.scss'

type Modo = 'entrada' | 'salida'

type Zona = {
  clave: string
  nombre: string
  aforo: number
  dentro: number
  activo?: boolean
}

type Resultado = {
  ok: boolean
  codigo?: string
  mensaje: string
  detalles: string
  pitido: 'exito' | 'error'
  nombre: string
  tipo: string
  asistencias: number
  dentro?: boolean
  currentlyInside?: boolean
  zona?: string
  zonaNombre?: string
  zonaDentro?: number
  zonaAforo?: number
  serverMs?: number
  dispositivo?: string
  reentry?: boolean
}

type Registro = Resultado & { clave: number; hora: string }

function usePitido() {
  const ctxRef = useRef<AudioContext | null>(null)

  const asegurar = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (Ctor) ctxRef.current = new Ctor()
    }
    if (ctxRef.current?.state === 'suspended') void ctxRef.current.resume()
    return ctxRef.current
  }, [])

  const sonar = useCallback(
    (tipo: 'exito' | 'error') => {
      const ctx = asegurar()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      if (tipo === 'exito') {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        gain.gain.setValueAtTime(0.5, ctx.currentTime)
        osc.start()
        osc.stop(ctx.currentTime + 0.12)
      } else {
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(150, ctx.currentTime)
        gain.gain.setValueAtTime(0.8, ctx.currentTime)
        osc.start()
        osc.stop(ctx.currentTime + 0.25)
      }
    },
    [asegurar],
  )

  return { sonar, asegurar }
}

export default function EscanearPage() {
  const [modo, setModo] = useState<Modo>('entrada')
  const [zonas, setZonas] = useState<Zona[]>([])
  const [zona, setZona] = useState('acreditacion')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [historial, setHistorial] = useState<Registro[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [camara, setCamara] = useState(false)
  const [cola, setCola] = useState(0)
  const [deviceId, setDeviceIdState] = useState(() => getDeviceId())
  const [latenciaMs, setLatenciaMs] = useState<number | null>(null)
  const [serverMs, setServerMs] = useState<number | null>(null)
  const [scanKey, setScanKey] = useState(() => sessionStorage.getItem('ficti_scan_key') || '')
  const [claveInput, setClaveInput] = useState('')
  const [needsKey, setNeedsKey] = useState(() => !sessionStorage.getItem('ficti_scan_key'))
  const inputRef = useRef<HTMLInputElement>(null)
  const enVueloRef = useRef(false)
  const modoRef = useRef<Modo>('entrada')
  const zonaRef = useRef('acreditacion')
  const deviceRef = useRef(deviceId)
  const { sonar, asegurar } = usePitido()

  modoRef.current = modo
  zonaRef.current = zona
  deviceRef.current = deviceId

  const enfocar = useCallback(() => {
    if (camara) return
    inputRef.current?.focus()
  }, [camara])

  const cargarZonas = useCallback(
    async (key: string) => {
      try {
        const res = await fetch('/api/zonas', { headers: { 'X-Scan-Key': key } })
        if (res.status === 401) {
          sessionStorage.removeItem('ficti_scan_key')
          setNeedsKey(true)
          setScanKey('')
          return
        }
        if (!res.ok) return
        const data = (await res.json()) as { zonas: Zona[] }
        const activas = (data.zonas || []).filter((z) => z.activo !== false)
        setZonas(activas)
        if (activas[0]) {
          setZona((prev) =>
            activas.some((z) => z.clave === prev) ? prev : activas[0]!.clave,
          )
        }
      } catch {
        /* zonas opcionales si aún no migró */
      }
    },
    [],
  )

  useEffect(() => {
    if (needsKey || !scanKey) return
    void cargarZonas(scanKey)
    setCola(readQueue().length)
  }, [needsKey, scanKey, cargarZonas])

  useEffect(() => {
    if (needsKey) return
    enfocar()
    const alClic = () => {
      asegurar()
      enfocar()
    }
    document.addEventListener('click', alClic)
    return () => document.removeEventListener('click', alClic)
  }, [enfocar, asegurar, needsKey])

  const postScan = useCallback(
    async (codigo: string, currentModo: Modo, currentZona: string, key: string) => {
      const res = await fetch('/api/escanear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Scan-Key': key,
        },
        body: JSON.stringify({ qr_data: codigo, modo: currentModo, zona: currentZona, dispositivo: deviceRef.current }),
      })
      return res
    },
    [],
  )

  const vaciarCola = useCallback(async () => {
    if (!scanKey || needsKey) return
    const { left } = await flushQueue(async (item) => {
      const res = await postScan(item.qr, item.modo, item.zona, scanKey)
      if (res.status === 401) return false
      const datos: Resultado = await res.json()
      if (datos.zona && datos.zonaDentro != null) {
        setZonas((prev) =>
          prev.map((z) =>
            z.clave === datos.zona
              ? {
                  ...z,
                  dentro: datos.zonaDentro!,
                  aforo: datos.zonaAforo || z.aforo,
                }
              : z,
          ),
        )
      }
      return true
    })
    setCola(left)
  }, [scanKey, needsKey, postScan])

  useEffect(() => {
    const on = () => void vaciarCola()
    window.addEventListener('online', on)
    if (navigator.onLine) void vaciarCola()
    return () => window.removeEventListener('online', on)
  }, [vaciarCola])

  const escanear = useCallback(
    async (qr: string) => {
      const codigo = qr.trim()
      if (!codigo || enVueloRef.current) return
      enVueloRef.current = true
      setOcupado(true)
      const t0 = performance.now()
      const currentModo = modoRef.current
      const currentZona = zonaRef.current
      try {
        if (!navigator.onLine) {
          enqueueScan({ qr: codigo, modo: currentModo, zona: currentZona })
          setCola(readQueue().length)
          setResultado({
            ok: false,
            mensaje: 'EN COLA OFFLINE',
            detalles: 'Sin red: se enviará al recuperar conexión. No es acceso confirmado.',
            pitido: 'error',
            nombre: '',
            tipo: '',
            asistencias: 0,
          })
          sonar('error')
          return
        }

        const res = await postScan(codigo, currentModo, currentZona, scanKey)
        if (res.status === 401) {
          sessionStorage.removeItem('ficti_scan_key')
          setNeedsKey(true)
          setScanKey('')
          setResultado({
            ok: false,
            mensaje: 'CLAVE INVALIDA',
            detalles: 'Vuelve a capturar la clave de escáner del equipo.',
            pitido: 'error',
            nombre: '',
            tipo: '',
            asistencias: 0,
          })
          sonar('error')
          return
        }
        const datos: Resultado = await res.json()
        setLatenciaMs(Math.round(performance.now() - t0))
        setServerMs(typeof datos.serverMs === 'number' ? datos.serverMs : null)
        setResultado(datos)
        if (datos.zona && datos.zonaDentro != null) {
          setZonas((prev) =>
            prev.map((z) =>
              z.clave === datos.zona
                ? {
                    ...z,
                    dentro: datos.zonaDentro!,
                    aforo: datos.zonaAforo || z.aforo,
                  }
                : z,
            ),
          )
        }
        sonar(datos.pitido)
        setHistorial((previo) =>
          [
            {
              ...datos,
              clave: previo.length ? previo[0].clave + 1 : 1,
              hora: new Date().toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
            },
            ...previo,
          ].slice(0, 8),
        )
      } catch {
        enqueueScan({ qr: codigo, modo: currentModo, zona: currentZona })
        setCola(readQueue().length)
        setResultado({
          ok: false,
          mensaje: 'EN COLA OFFLINE',
          detalles: 'No se pudo contactar al servidor. Quedó en cola local.',
          pitido: 'error',
          nombre: '',
          tipo: '',
          asistencias: 0,
        })
        sonar('error')
      } finally {
        enVueloRef.current = false
        setOcupado(false)
        if (inputRef.current) inputRef.current.value = ''
        enfocar()
      }
    },
    [sonar, enfocar, scanKey, postScan],
  )

  if (needsKey) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h2 className={styles.title}>Clave de escáner</h2>
          <p className={styles.hint}>
            Esta estación requiere la clave operativa del evento. No es el login
            del panel: es la llave de puerta para el PDA.
          </p>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault()
              const k = claveInput.trim()
              if (!k) return
              sessionStorage.setItem('ficti_scan_key', k)
              setScanKey(k)
              setNeedsKey(false)
            }}
          >
            <input
              className={styles.input}
              type="password"
              value={claveInput}
              onChange={(e) => setClaveInput(e.target.value)}
              placeholder="X-Scan-Key"
              autoFocus
              autoComplete="off"
            />
            <button
              type="submit"
              className={`${styles.modeBtn} ${styles.entrada}`}
              style={{ marginTop: 12, width: '100%' }}
            >
              Continuar
            </button>
          </form>
        </div>
      </div>
    )
  }

  const zonaActiva = zonas.find((z) => z.clave === zona)

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h2 className={styles.title}>Control de acceso</h2>
        <p className={styles.hint}>
          Reingreso: primero SALIDA, después ENTRADA. El aforo de zona se actualiza
          en el panel Accesos.
        </p>

        <div className={styles.modes}>
          <button
            type="button"
            className={`${styles.modeBtn} ${styles.entrada}${modo === 'entrada' ? '' : ` ${styles.inactive}`}`}
            onClick={() => {
              setModo('entrada')
              enfocar()
            }}
          >
            ENTRADA
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${styles.salida}${modo === 'salida' ? '' : ` ${styles.inactive}`}`}
            onClick={() => {
              setModo('salida')
              enfocar()
            }}
          >
            SALIDA
          </button>
        </div>

        {zonas.length ? (
          <div className={styles.zonas} role="group" aria-label="Zona">
            {zonas.map((z) => (
              <button
                key={z.clave}
                type="button"
                className={zona === z.clave ? styles.zonaOn : styles.zona}
                onClick={() => {
                  setZona(z.clave)
                  enfocar()
                }}
              >
                <strong>{z.nombre}</strong>
                <span>
                  {z.dentro}/{z.aforo || '∞'}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault()
            void escanear(inputRef.current?.value ?? '')
          }}
        >
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            name="qr_data"
            id="qr_input"
            placeholder="Escanea el QR…"
            autoFocus
            autoComplete="off"
            inputMode="none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void escanear(e.currentTarget.value)
              }
            }}
          />
        </form>

        <CameraScan
          active={camara}
          onToggle={setCamara}
          disabled={ocupado}
          onScan={(code) => void escanear(code)}
        />

        <label className={styles.hint} htmlFor="device_id">Estación / PDA</label>
        <input
          id="device_id"
          className={styles.input}
          value={deviceId}
          onChange={(e) => { setDeviceIdState(e.target.value); setDeviceId(e.target.value) }}
          onBlur={() => setDeviceIdState(setDeviceId(deviceId))}
          placeholder="puerta-1"
          autoComplete="off"
        />

        <p className={styles.hint}>
          {ocupado
            ? 'Registrando…'
            : 'USB (más rápido), PDA o cámara. Sin debounce en HID.'}
          {latenciaMs != null ? ` · cliente ${latenciaMs} ms` : ''}
          {serverMs != null ? ` · server ${serverMs} ms` : ''}
          {zonaActiva ? ` · ${zonaActiva.nombre}` : ''}
          {cola > 0 ? ` · Cola offline: ${cola}` : ''}
        </p>

        {resultado ? (
          <div className={`${styles.resultado} ${resultado.ok ? styles.exito : styles.fallo}`}>
            <strong>{resultado.mensaje}</strong>
            <span>{resultado.detalles}</span>
            {resultado.ok ? (
              <span className={styles.conteo}>
                {resultado.dentro || resultado.asistencias > 0 ? 'Ahora: DENTRO' : 'Ahora: FUERA'}
                {resultado.zonaNombre
                  ? ` · ${resultado.zonaNombre} ${resultado.zonaDentro ?? '—'}/${resultado.zonaAforo || '∞'}`
                  : ''}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {historial.length ? (
        <div className={styles.historial}>
          <h3>Últimos escaneos</h3>
          <ul>
            {historial.map((r) => (
              <li key={r.clave} className={r.ok ? styles.filaOk : styles.filaMal}>
                <span className={styles.hora}>{r.hora}</span>
                <span className={styles.quien}>{r.nombre || r.detalles}</span>
                <span className={styles.marca}>{r.ok ? '✓' : '✕'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
