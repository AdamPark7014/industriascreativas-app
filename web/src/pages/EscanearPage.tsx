import { useEffect, useRef, useState } from 'react'
import styles from '../styles/escanear.module.scss'

type Modo = 'entrada' | 'salida'

export default function EscanearPage() {
  const [modo, setModo] = useState<Modo>('entrada')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focusInput = () => inputRef.current?.focus()
    focusInput()
    document.addEventListener('click', focusInput)
    return () => document.removeEventListener('click', focusInput)
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h2 className={styles.title}>📷 Control de Acceso</h2>

        <div className={styles.modes}>
          <button
            type="button"
            className={`${styles.modeBtn} ${styles.entrada}${modo === 'entrada' ? '' : ` ${styles.inactive}`}`}
            onClick={() => {
              setModo('entrada')
              inputRef.current?.focus()
            }}
          >
            🟢 ENTRADA
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${styles.salida}${modo === 'salida' ? '' : ` ${styles.inactive}`}`}
            onClick={() => {
              setModo('salida')
              inputRef.current?.focus()
            }}
          >
            🔴 SALIDA
          </button>
        </div>

        <form action="/escanear" method="POST" className={styles.form}>
          <input type="hidden" name="modo" value={modo} />
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            name="qr_data"
            id="qr_input"
            placeholder="Escanea el QR..."
            autoFocus
            autoComplete="off"
          />
        </form>
      </div>
    </div>
  )
}
