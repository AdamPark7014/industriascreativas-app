import { useCallback, useEffect, useRef, useState } from 'react'
import styles from '../styles/escanear.module.scss'

type Modo = 'entrada' | 'salida'

type Resultado = {
  ok: boolean
  mensaje: string
  detalles: string
  pitido: 'exito' | 'error'
  nombre: string
  tipo: string
  asistencias: number
}

type Registro = Resultado & { clave: number; hora: string }

/** El AudioContext solo arranca tras un gesto del usuario: se crea una vez y
 *  se reutiliza, porque instanciarlo en cada escaneo introduce latencia. */
function usePitido() {
  const ctxRef = useRef<AudioContext | null>(null)

  const asegurar = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
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
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [historial, setHistorial] = useState<Registro[]>([])
  const [ocupado, setOcupado] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Evita que un lector que dispara dos veces cuente una entrada de más.
  const enVueloRef = useRef(false)
  const { sonar, asegurar } = usePitido()

  const enfocar = useCallback(() => inputRef.current?.focus(), [])

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
      if (!codigo || enVueloRef.current) return
      enVueloRef.current = true
      setOcupado(true)
      try {
        const res = await fetch('/api/escanear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qr_data: codigo, modo }),
        })
        const datos: Resultado = await res.json()
        setResultado(datos)
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
        setResultado({
          ok: false,
          mensaje: '⚠️ SIN CONEXIÓN',
          detalles: 'No se pudo contactar al servidor. Revisa la red e inténtalo otra vez.',
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
    [modo, sonar, enfocar],
  )

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h2 className={styles.title}>Control de acceso</h2>

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
            // El lector actúa como teclado y cierra con Enter. La sumisión
            // implícita del formulario no es de fiar sin botón de submit, y si
            // falla el escáner entero deja de responder: se captura la tecla.
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void escanear(e.currentTarget.value)
              }
            }}
          />
        </form>

        <p className={styles.hint}>
          {ocupado ? 'Registrando…' : 'Listo para escanear. El cursor vuelve solo al campo.'}
        </p>

        {resultado ? (
          <div className={`${styles.resultado} ${resultado.ok ? styles.exito : styles.fallo}`}>
            <strong>{resultado.mensaje}</strong>
            <span>{resultado.detalles}</span>
            {resultado.ok ? (
              <span className={styles.conteo}>
                {modo === 'salida' ? 'Entradas activas' : 'Entradas'}: {resultado.asistencias}/1
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
