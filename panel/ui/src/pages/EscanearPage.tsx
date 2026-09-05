import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import { api, type ScanResult, type Sesion, type Zona } from '../api'
import CameraScan from '../components/CameraScan'
import { enqueueScan, flushQueue, readQueue } from '../lib/offlineQueue'
import styles from './escanear.module.scss'

type Modo = 'entrada' | 'salida'

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
    },
    [asegurar],
  )
  return { sonar, asegurar }
}

function aplicarAforo(
  zonas: Zona[],
  clave: string | undefined,
  dentro: number | undefined,
  aforo: number | undefined,
): Zona[] {
  if (!clave || dentro == null) return zonas
  return zonas.map((z) =>
    z.clave === clave
      ? { ...z, dentro, aforo: aforo != null && aforo > 0 ? aforo : z.aforo }
      : z,
  )
}

export default function EscanearPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [modo, setModo] = useState<Modo>('entrada')
  const [zonas, setZonas] = useState<Zona[]>([])
  const [zona, setZona] = useState('acreditacion')
  const [resultado, setResultado] = useState<ScanResult | null>(null)
  const [historial, setHistorial] = useState<(ScanResult & { clave: number; hora: string })[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [latenciaMs, setLatenciaMs] = useState<number | null>(null)
  const [camara, setCamara] = useState(false)
  const [cola, setCola] = useState(0)
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const enVuelo = useRef(false)
  const modoRef = useRef<Modo>('entrada')
  const zonaRef = useRef('acreditacion')
  const { sonar, asegurar } = usePitido()
  const enfocar = useCallback(() => {
    if (camara) return
    inputRef.current?.focus()
  }, [camara])

  modoRef.current = modo
  zonaRef.current = zona

  const refrescarZonas = useCallback(() => {
    void api.zonas().then((d) => {
      const activas = d.zonas.filter((z) => z.activo)
      setZonas(activas)
      setZona((prev) =>
        activas.some((z) => z.clave === prev) ? prev : activas[0]?.clave ?? 'acreditacion',
      )
    })
  }, [])

  useEffect(() => {
    refrescarZonas()
    setCola(readQueue().length)
  }, [refrescarZonas])

  useEffect(() => {
    enfocar()
    const alClic = () => {
      asegurar()
      enfocar()
    }
    document.addEventListener('click', alClic)
    return () => document.removeEventListener('click', alClic)
  }, [enfocar, asegurar])

  const registrarHistorial = useCallback((datos: ScanResult) => {
    setHistorial((prev) =>
      [
        {
          ...datos,
          clave: prev.length ? prev[0].clave + 1 : 1,
          hora: new Date().toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        },
        ...prev,
      ].slice(0, 10),
    )
  }, [])

  const vaciarCola = useCallback(async () => {
    const { left } = await flushQueue(async (item) => {
      const datos = await api.escanear(item.qr, item.modo, item.zona)
      setZonas((prev) =>
        aplicarAforo(prev, datos.zona, datos.zonaDentro, datos.zonaAforo),
      )
      registrarHistorial({
        ...datos,
        detalles: `${datos.detalles} · sync offline`,
      })
      return true
    })
    setCola(left)
  }, [registrarHistorial])

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
    async (qr: string) => {
      const codigo = qr.trim()
      if (!codigo || enVuelo.current) return
      enVuelo.current = true
      setOcupado(true)
      const t0 = performance.now()
      const currentModo = modoRef.current
      const currentZona = zonaRef.current
      try {
        if (!navigator.onLine) {
          enqueueScan({ qr: codigo, modo: currentModo, zona: currentZona })
          setCola(readQueue().length)
          const fail: ScanResult = {
            ok: false,
            mensaje: 'EN COLA OFFLINE',
            detalles: 'Sin red: se enviará al recuperar conexión. No es acceso confirmado.',
            pitido: 'error',
            nombre: '',
            tipo: '',
            asistencias: 0,
            dentro: false,
          }
          setResultado(fail)
          sonar('error')
          return
        }
        const datos = await api.escanear(codigo, currentModo, currentZona)
        setLatenciaMs(Math.round(performance.now() - t0))
        setResultado(datos)
        setZonas((prev) =>
          aplicarAforo(prev, datos.zona, datos.zonaDentro, datos.zonaAforo),
        )
        sonar(datos.pitido)
        registrarHistorial(datos)
      } catch (e) {
        setLatenciaMs(Math.round(performance.now() - t0))
        const msg = e instanceof Error ? e.message : 'No se pudo contactar al servidor'
        if (msg === 'sesion' || msg === 'sesion_expirada') {
          setResultado({
            ok: false,
            mensaje: 'SESIÓN EXPIRADA',
            detalles: 'Vuelve a iniciar sesión.',
            pitido: 'error',
            nombre: '',
            tipo: '',
            asistencias: 0,
            dentro: false,
          })
        } else {
          enqueueScan({ qr: codigo, modo: currentModo, zona: currentZona })
          setCola(readQueue().length)
          setResultado({
            ok: false,
            mensaje: 'EN COLA OFFLINE',
            detalles: `${msg}. Quedó en cola local hasta recuperar red.`,
            pitido: 'error',
            nombre: '',
            tipo: '',
            asistencias: 0,
            dentro: false,
          })
        }
        sonar('error')
      } finally {
        enVuelo.current = false
        setOcupado(false)
        if (inputRef.current) inputRef.current.value = ''
        enfocar()
      }
    },
    [sonar, enfocar, registrarHistorial],
  )

  if (sesion && !sesion.puedeOperar) {
    return <Navigate to="/reportes" replace />
  }

  const zonaActiva = zonas.find((z) => z.clave === zona)

  return (
    <div className={styles.page}>
      <div className={styles.station}>
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
            <span>Primer acceso o reingreso tras salida</span>
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
            <span>Libera cupo · habilita reingreso</span>
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
          <label className={styles.label} htmlFor="qr_input">
            Lector USB / teclado
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

        <p className={styles.hint}>
          {ocupado
            ? 'Validando… un momento'
            : modo === 'entrada'
              ? 'Listo para ENTRADA. Si ya está dentro, se rechaza hasta registrar una salida.'
              : 'Listo para SALIDA. Libera el aforo y permite que vuelva a entrar.'}
          {latenciaMs != null ? ` · ${latenciaMs} ms` : ''}
          {zonaActiva ? ` · Zona: ${zonaActiva.nombre}` : ''}
          {!online ? ' · Sin red' : ''}
          {cola > 0 ? ` · Cola offline: ${cola}` : ''}
        </p>

        {resultado ? (
          <div
            className={`${styles.resultado} ${resultado.ok ? styles.exito : styles.fallo}`}
            role="status"
            aria-live="assertive"
          >
            <strong>{resultado.mensaje}</strong>
            <span>{resultado.detalles}</span>
            {resultado.nombre ? (
              <span className={styles.persona}>
                {resultado.nombre}
                {resultado.tipo ? ` · ${resultado.tipo}` : ''}
              </span>
            ) : null}
            <span className={styles.conteo}>
              {resultado.dentro || resultado.asistencias > 0 ? 'Ahora: DENTRO' : 'Ahora: FUERA'}
              {resultado.zonaNombre
                ? ` · ${resultado.zonaNombre} ${resultado.zonaDentro ?? '—'}/${resultado.zonaAforo || '∞'}`
                : ''}
            </span>
          </div>
        ) : (
          <div className={styles.espera}>
            <strong>Esperando el siguiente boleto</strong>
            <span>USB, PDA o cámara — elige el modo y la zona primero.</span>
          </div>
        )}
      </div>

      <aside className={styles.historial}>
        <h2>Últimos resultados</h2>
        {!historial.length ? (
          <p className={styles.histVacio}>
            Aquí verás cada validación (nombre y si pasó o no) en cuanto escanees.
          </p>
        ) : (
          <ul>
            {historial.map((r) => (
              <li key={r.clave} className={r.ok ? styles.filaOk : styles.filaMal}>
                <span>{r.hora}</span>
                <span>{r.nombre || r.detalles}</span>
                <span>{r.ok ? '✓' : '✕'}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
