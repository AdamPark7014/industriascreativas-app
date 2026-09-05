import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import { api, type ScanResult, type Sesion, type Zona } from '../api'
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

export default function EscanearPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [modo, setModo] = useState<Modo>('entrada')
  const [zonas, setZonas] = useState<Zona[]>([])
  const [zona, setZona] = useState('acreditacion')
  const [resultado, setResultado] = useState<ScanResult | null>(null)
  const [historial, setHistorial] = useState<(ScanResult & { clave: number; hora: string })[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [latenciaMs, setLatenciaMs] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const enVuelo = useRef(false)
  const { sonar, asegurar } = usePitido()
  const enfocar = useCallback(() => inputRef.current?.focus(), [])

  useEffect(() => {
    void api.zonas().then((d) => {
      const activas = d.zonas.filter((z) => z.activo)
      setZonas(activas)
      if (activas[0]) setZona(activas[0].clave)
    })
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

  const escanear = useCallback(
    async (qr: string) => {
      const codigo = qr.trim()
      if (!codigo || enVuelo.current) return
      enVuelo.current = true
      setOcupado(true)
      const t0 = performance.now()
      try {
        const datos = await api.escanear(codigo, modo, zona)
        setLatenciaMs(Math.round(performance.now() - t0))
        setResultado(datos)
        sonar(datos.pitido)
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
      } catch (e) {
        setLatenciaMs(Math.round(performance.now() - t0))
        const fail: ScanResult = {
          ok: false,
          mensaje: 'SIN CONEXIÓN',
          detalles: e instanceof Error ? e.message : 'No se pudo contactar al servidor',
          pitido: 'error',
          nombre: '',
          tipo: '',
          asistencias: 0,
          dentro: false,
        }
        setResultado(fail)
        sonar('error')
      } finally {
        enVuelo.current = false
        setOcupado(false)
        if (inputRef.current) inputRef.current.value = ''
        enfocar()
      }
    },
    [modo, zona, sonar, enfocar],
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
            <span>Check-in · primer acceso</span>
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
            <span>Checkout · habilita reingreso</span>
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
            Código QR / folio
          </label>
          <input
            ref={inputRef}
            id="qr_input"
            className={styles.input}
            type="text"
            name="qr_data"
            placeholder="Apunta el lector y escanea…"
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

        <p className={styles.hint}>
          {ocupado
            ? 'Validando…'
            : modo === 'entrada'
              ? 'Listo para entrada. Si la persona ya está dentro, se rechaza hasta una salida.'
              : 'Listo para salida. Libera el aforo y permite reingreso.'}
          {latenciaMs != null ? ` · ${latenciaMs} ms` : ''}
          {zonaActiva ? ` · ${zonaActiva.nombre}` : ''}
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
              Estado: {resultado.asistencias > 0 ? 'DENTRO' : 'FUERA'} ({resultado.asistencias}/1)
            </span>
          </div>
        ) : (
          <div className={styles.espera}>Esperando el siguiente escaneo</div>
        )}
      </div>

      <aside className={styles.historial}>
        <h2>Últimos escaneos</h2>
        {!historial.length ? (
          <p className={styles.histVacio}>Los resultados aparecen aquí en cuanto validas un gafete.</p>
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
