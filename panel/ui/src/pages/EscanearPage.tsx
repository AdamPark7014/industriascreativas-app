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
  const sesion = useOutletContext<Sesion | null>()
  const [modo, setModo] = useState<Modo>('entrada')
  const [zonas, setZonas] = useState<Zona[]>([])
  const [zona, setZona] = useState('acreditacion')
  const [resultado, setResultado] = useState<ScanResult | null>(null)
  const [historial, setHistorial] = useState<(ScanResult & { clave: number; hora: string })[]>([])
  const [ocupado, setOcupado] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const enVuelo = useRef(false)
  const { sonar, asegurar } = usePitido()
  const enfocar = useCallback(() => inputRef.current?.focus(), [])

  useEffect(() => {
    void api.zonas().then((d) => {
      setZonas(d.zonas.filter((z) => z.activo))
      if (d.zonas[0]) setZona(d.zonas[0].clave)
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
      try {
        const datos = await api.escanear(codigo, modo, zona)
        setResultado(datos)
        sonar(datos.pitido)
        setHistorial((prev) =>
          [
            {
              ...datos,
              clave: prev.length ? prev[0].clave + 1 : 1,
              hora: new Date().toLocaleTimeString('es-MX'),
            },
            ...prev,
          ].slice(0, 8),
        )
      } catch (e) {
        const fail: ScanResult = {
          ok: false,
          mensaje: 'SIN CONEXIÓN',
          detalles: e instanceof Error ? e.message : 'Error',
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

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Escáner de accesos</h1>
        <p className={styles.hintReingreso}>
          Reingreso: SALIDA y después ENTRADA. Sin salida, la segunda entrada se rechaza.
        </p>
        <div className={styles.modes}>
          <button
            type="button"
            className={`${styles.entrada} ${modo === 'entrada' ? '' : styles.inactive}`}
            onClick={() => {
              setModo('entrada')
              enfocar()
            }}
          >
            ENTRADA
          </button>
          <button
            type="button"
            className={`${styles.salida} ${modo === 'salida' ? '' : styles.inactive}`}
            onClick={() => {
              setModo('salida')
              enfocar()
            }}
          >
            SALIDA
          </button>
        </div>
        {zonas.length ? (
          <div className={styles.zonas}>
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
                {z.nombre}
                <small>
                  {z.dentro}/{z.aforo || '∞'}
                </small>
              </button>
            ))}
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void escanear(inputRef.current?.value ?? '')
          }}
        >
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
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
        <p className={styles.hint}>
          {ocupado ? 'Registrando…' : 'Listo. El cursor vuelve al campo solo.'}
        </p>
        {resultado ? (
          <div className={`${styles.resultado} ${resultado.ok ? styles.exito : styles.fallo}`}>
            <strong>{resultado.mensaje}</strong>
            <span>{resultado.detalles}</span>
            <span className={styles.conteo}>
              {modo === 'salida' ? 'Dentro' : 'Entradas'}: {resultado.asistencias}/1
            </span>
          </div>
        ) : null}
      </div>
      {historial.length ? (
        <ul className={styles.historial}>
          {historial.map((r) => (
            <li key={r.clave} className={r.ok ? styles.filaOk : styles.filaMal}>
              <span>{r.hora}</span>
              <span>{r.nombre || r.detalles}</span>
              <span>{r.ok ? '✓' : '✕'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
