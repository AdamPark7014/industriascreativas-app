import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import { api, type ScanResult, type Sesion } from '../api'
import CameraScan from '../components/CameraScan'
import { getDeviceId, setDeviceId } from '../lib/deviceId'
import { enqueueScan, flushQueue, readQueue } from '../lib/offlineQueue'
import styles from './escanear.module.scss'

/** Portado de FICTI (panel/ui/src/pages/EscanearPage.tsx): misma puerta, sin zonas. */

type Modo = 'entrada' | 'salida'

/**
 * Tras cada resultado la cámara se detiene para que la puerta lea la tarjeta y la
 * persona retire el pase: si no, vuelve a leer el mismo QR y rebota «ya dentro».
 */
const PAUSA_OK_MS = 2000
const PAUSA_RECHAZO_MS = 3500
/**
 * Los lectores de las PDA a veces disparan dos veces la misma lectura: en este lapso se
 * ignora en silencio. Pasado eso, repetir un pase SÍ va al servidor y sale rechazado
 * («YA DENTRO» / «SALIDA DENEGADA»): la puerta tiene que verlo.
 */
const DOBLE_DISPARO_USB_MS = 1500

/** La cola sin red guarda una "zona"; PUMPKIN tiene un solo acceso. */
const ZONA = 'acceso'

type Origen = 'lector' | 'camara'

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
      if (ctx) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        if (tipo === 'exito') {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(880, ctx.currentTime)
          gain.gain.setValueAtTime(0.55, ctx.currentTime)
          osc.start()
          osc.stop(ctx.currentTime + 0.12)
        } else {
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(150, ctx.currentTime)
          gain.gain.setValueAtTime(0.75, ctx.currentTime)
          osc.start()
          osc.stop(ctx.currentTime + 0.22)
        }
      }
      // En la PDA la vibración se siente aunque haya ruido en la fila.
      navigator.vibrate?.(tipo === 'exito' ? 60 : [120, 60, 120])
    },
    [asegurar],
  )
  return { sonar, asegurar }
}

const avisoCliente = (codigo: string, mensaje: string, detalles: string): ScanResult => ({
  ok: false,
  codigo,
  mensaje,
  detalles,
  pitido: 'error',
  nombre: '',
  tipo: '',
  asistencias: 0,
  dentro: false,
})

export default function EscanearPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [modo, setModo] = useState<Modo>('entrada')
  const [resultado, setResultado] = useState<ScanResult | null>(null)
  const [historial, setHistorial] = useState<(ScanResult & { clave: number; hora: string })[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [latenciaMs, setLatenciaMs] = useState<number | null>(null)
  const [serverMs, setServerMs] = useState<number | null>(null)
  const [camara, setCamara] = useState(false)
  const [cola, setCola] = useState(0)
  const [aforo, setAforo] = useState<{ dentro: number; aforo: number } | null>(null)
  const [deviceId, setDeviceIdState] = useState(() => getDeviceId())
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const inputRef = useRef<HTMLInputElement>(null)
  const enVuelo = useRef(false)
  /** Último pase validado (con su modo) para no repetirlo por error. */
  const ultimoRef = useRef<{ codigo: string; at: number; modo: string }>({ codigo: '', at: 0, modo: '' })
  const [pausa, setPausa] = useState<{ ms: number; clave: number } | null>(null)
  const pausadoRef = useRef(false)
  const pausaTimer = useRef(0)
  const modoRef = useRef<Modo>('entrada')
  const deviceRef = useRef(deviceId)
  const { sonar, asegurar } = usePitido()
  const enfocar = useCallback(() => {
    if (camara) return
    // Foco inmediato para el lector de la PDA (teclado)
    inputRef.current?.focus({ preventScroll: true })
  }, [camara])

  modoRef.current = modo
  deviceRef.current = deviceId

  const iniciarPausa = useCallback((ok: boolean) => {
    const ms = ok ? PAUSA_OK_MS : PAUSA_RECHAZO_MS
    window.clearTimeout(pausaTimer.current)
    pausadoRef.current = true
    setPausa({ ms, clave: Date.now() })
    pausaTimer.current = window.setTimeout(() => {
      pausadoRef.current = false
      setPausa(null)
    }, ms)
  }, [])

  /** «Siguiente»: corta la pausa y permite volver a leer incluso el mismo pase. */
  const siguiente = useCallback(() => {
    window.clearTimeout(pausaTimer.current)
    pausadoRef.current = false
    setPausa(null)
    ultimoRef.current = { codigo: '', at: 0, modo: '' }
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => () => window.clearTimeout(pausaTimer.current), [])

  useEffect(() => {
    setCola(readQueue().length)
  }, [])

  useEffect(() => {
    enfocar()
    const alClic = () => {
      asegurar()
      enfocar()
    }
    document.addEventListener('click', alClic)
    return () => document.removeEventListener('click', alClic)
  }, [enfocar, asegurar])

  const anotarAforo = useCallback((d: ScanResult) => {
    if (typeof d.zonaDentro === 'number') setAforo({ dentro: d.zonaDentro, aforo: d.zonaAforo ?? 0 })
  }, [])

  const registrarHistorial = useCallback((datos: ScanResult) => {
    setHistorial((prev) =>
      [
        {
          ...datos,
          clave: prev.length ? prev[0].clave + 1 : 1,
          hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        },
        ...prev,
      ].slice(0, 10),
    )
  }, [])

  const vaciarCola = useCallback(async () => {
    const { left } = await flushQueue(async (item) => {
      const datos = await api.escanear(item.qr, item.modo, {
        dispositivo: item.dispositivo || deviceRef.current,
        origen: 'offline',
        leidoEn: item.at,
      })
      anotarAforo(datos)
      registrarHistorial({ ...datos, detalles: `${datos.detalles} · enviado al volver la red` })
      return true
    })
    setCola(left)
  }, [registrarHistorial, anotarAforo])

  useEffect(() => {
    const on = () => {
      setOnline(true)
      void vaciarCola()
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    if (navigator.onLine) void vaciarCola()
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [vaciarCola])

  const escanear = useCallback(
    async (qr: string, origen: Origen = 'lector') => {
      const codigo = qr.trim()
      if (!codigo || enVuelo.current) return
      // En la pausa de confirmación la cámara sigue viendo el mismo QR: no valida nada.
      if (origen === 'camara' && pausadoRef.current) return
      const ahora = Date.now()
      const u = ultimoRef.current
      if (origen === 'lector' && u.codigo === codigo && u.modo === modoRef.current && ahora - u.at < DOBLE_DISPARO_USB_MS) {
        // Doble disparo del lector: la misma lectura, se ignora sin pitido.
        if (inputRef.current) inputRef.current.value = ''
        return
      }
      ultimoRef.current = { codigo, at: ahora, modo: modoRef.current }
      let resultadoOk = false
      enVuelo.current = true
      setResultado({
        ok: true,
        codigo: 'PENDING',
        mensaje: 'VALIDANDO…',
        detalles: codigo,
        pitido: 'exito',
        nombre: '',
        tipo: '',
        asistencias: 0,
        dentro: false,
      })
      setOcupado(true)
      const t0 = performance.now()
      const currentModo = modoRef.current
      const currentDevice = deviceRef.current
      const aCola = (detalles: string) => {
        enqueueScan({ qr: codigo, modo: currentModo, zona: ZONA, dispositivo: currentDevice })
        setCola(readQueue().length)
        setResultado(avisoCliente('OFFLINE', 'EN COLA SIN RED', detalles))
        sonar('error')
      }
      try {
        if (!navigator.onLine) {
          aCola('Sin red: se enviará al recuperar conexión. No es acceso confirmado.')
          return
        }
        const datos = await api.escanear(codigo, currentModo, { dispositivo: currentDevice, origen })
        setLatenciaMs(Math.round(performance.now() - t0))
        setServerMs(typeof datos.serverMs === 'number' ? datos.serverMs : null)
        resultadoOk = datos.ok
        setResultado(datos)
        anotarAforo(datos)
        sonar(datos.pitido)
        registrarHistorial(datos)
      } catch (e) {
        setLatenciaMs(Math.round(performance.now() - t0))
        setServerMs(null)
        const msg = e instanceof Error ? e.message : 'No se pudo contactar al servidor'
        if (msg === 'sesion') {
          setResultado(avisoCliente('UNAUTHORIZED', 'SESIÓN EXPIRADA', 'Vuelve a entrar con el usuario de esta PDA.'))
          sonar('error')
        } else {
          aCola(`${msg}. Quedó en cola local hasta recuperar red.`)
        }
      } finally {
        enVuelo.current = false
        setOcupado(false)
        if (inputRef.current) inputRef.current.value = ''
        iniciarPausa(resultadoOk)
        enfocar()
      }
    },
    [sonar, enfocar, registrarHistorial, iniciarPausa, anotarAforo],
  )

  if (sesion && !sesion.puedeOperar) {
    return <Navigate to="/" replace />
  }

  const pendiente = resultado?.codigo === 'PENDING'
  const claseEstado = !resultado ? '' : pendiente ? styles.validando : resultado.ok ? styles.exito : styles.fallo
  const total = sesion?.totalPases ?? 250

  return (
    <div className={styles.page}>
      <div className={styles.station}>
        {sesion?.jornada ? (
          <div className={styles.diaBanner} role="status">
            <strong>Jornada · {sesion.jornada.nombre}</strong>
            <span>
              dentro/fuera se reinicia a las {sesion.jornada.corteHora}:00
              {aforo ? ` · dentro ahora ${aforo.dentro}/${aforo.aforo || total}` : ''}
            </span>
          </div>
        ) : null}

        {/* El resultado va primero: la puerta ve si pasa o no sin bajar la pantalla. */}
        {resultado ? (
          <div className={`${styles.resultado} ${claseEstado}`} role="status" aria-live="assertive">
            <div className={styles.resCabeza}>
              <span className={styles.resIcono} aria-hidden>
                {pendiente ? '…' : resultado.ok ? '✓' : '✕'}
              </span>
              <strong>{resultado.mensaje}</strong>
            </div>
            {resultado.nombre ? (
              <span className={styles.persona}>
                {resultado.nombre}
                {resultado.folio ? ` · ${resultado.folio}` : ''}
              </span>
            ) : null}
            <span className={styles.detalle}>{resultado.detalles}</span>
            {!pendiente && resultado.tipo ? (
              <span className={styles.conteo}>
                {(resultado.currentlyInside ?? resultado.dentro) ? 'Ahora: DENTRO' : 'Ahora: FUERA'}
                {resultado.reentry ? ' · REINGRESO' : ''}
                {resultado.entradasHoy ? ` · entradas hoy: ${resultado.entradasHoy}` : ''}
                {typeof resultado.zonaDentro === 'number'
                  ? ` · dentro ${resultado.zonaDentro}/${resultado.zonaAforo || total}`
                  : ''}
              </span>
            ) : null}
            {pausa ? (
              <div className={styles.pausa}>
                <span className={styles.pausaPista}>
                  <span key={pausa.clave} className={styles.pausaBarra} style={{ animationDuration: `${pausa.ms}ms` }} />
                </span>
                <button type="button" className={styles.siguiente} onClick={siguiente}>
                  Siguiente
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.espera}>
            <strong>Listo: escanea un pase</strong>
            <span>Elige ENTRADA o SALIDA; el resultado aparece aquí.</span>
          </div>
        )}

        <div className={styles.modes}>
          <button
            type="button"
            className={`${styles.entrada} ${modo === 'entrada' ? styles.on : styles.off}`}
            onClick={() => {
              setModo('entrada')
              enfocar()
            }}
          >
            <strong>ENTRADA</strong>
            <span>Acceso o reingreso</span>
          </button>
          <button
            type="button"
            className={`${styles.salida} ${modo === 'salida' ? styles.on : styles.off}`}
            onClick={() => {
              setModo('salida')
              enfocar()
            }}
          >
            <strong>SALIDA</strong>
            <span>Permite reingresar</span>
          </button>
        </div>

        <CameraScan
          active={camara}
          onToggle={setCamara}
          disabled={ocupado}
          paused={Boolean(pausa)}
          onScan={(code) => void escanear(code, 'camara')}
        />

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault()
            void escanear(inputRef.current?.value ?? '')
          }}
        >
          <label className={styles.label} htmlFor="qr_input">
            Lector de la PDA / teclado
          </label>
          <input
            ref={inputRef}
            id="qr_input"
            className={styles.input}
            type="text"
            name="qr_data"
            placeholder="Apunta el lector aquí y escanea…"
            autoFocus
            autoComplete="off"
            inputMode="none"
            enterKeyHint="go"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void escanear(e.currentTarget.value)
              }
            }}
          />
        </form>

        <p className={styles.hint}>
          {ocupado
            ? 'Validando… un momento'
            : pausa
              ? 'Retira el pase: la cámara sigue en un momento o pulsa «Siguiente».'
              : modo === 'entrada'
                ? 'Listo para ENTRADA. Si ya está dentro, se rechaza hasta registrar una salida.'
                : 'Listo para SALIDA. Si no está dentro, se rechaza.'}
          {latenciaMs != null ? ` · cliente ${latenciaMs} ms${serverMs != null ? ` · server ${serverMs} ms` : ''}` : ''}
          {!online ? ' · Sin red' : ''}
          {cola > 0 ? ` · Cola sin red: ${cola}` : ''}
        </p>

        <details className={styles.ajustes}>
          <summary>Ajustes de la estación</summary>
          <label className={styles.label} htmlFor="device_id">
            Estación / PDA
          </label>
          <input
            id="device_id"
            className={styles.input}
            type="text"
            value={deviceId}
            onChange={(e) => {
              const v = e.target.value
              setDeviceIdState(v)
              setDeviceId(v)
            }}
            onBlur={() => setDeviceIdState(setDeviceId(deviceId))}
            placeholder="ej. pda-1"
            autoComplete="off"
          />
        </details>

        <details className={styles.ajustes}>
          <summary>El QR no lee: teclear el número</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const campo = e.currentTarget.elements.namedItem('manual') as HTMLInputElement
              const v = campo.value.trim()
              campo.value = ''
              if (v) void escanear(v)
            }}
          >
            <label className={styles.label} htmlFor="manual">
              Número impreso bajo el QR (ej. 45 = QR-045)
            </label>
            <input
              id="manual"
              name="manual"
              className={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="45"
              enterKeyHint="go"
              onClick={(e) => e.stopPropagation()}
            />
          </form>
        </details>
      </div>

      <aside className={styles.historial}>
        <h2>Últimos resultados</h2>
        {!historial.length ? (
          <p className={styles.histVacio}>Aquí verás cada validación (pase y si pasó o no) en cuanto escanees.</p>
        ) : (
          <ul>
            {historial.map((r) => (
              <li key={r.clave} className={r.ok ? styles.filaOk : styles.filaMal}>
                <span>{r.hora}</span>
                <span>
                  {r.nombre ? `${r.nombre} · ${r.mensaje.toLowerCase()}` : r.mensaje.toLowerCase()}
                </span>
                <span>{r.ok ? '✓' : '✕'}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
