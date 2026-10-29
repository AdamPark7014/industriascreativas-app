import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import styles from './login.module.scss'

/**
 * Acceso directo de una PDA: /pumpkin/directo#puerta3.<token>. El token va en el #fragmento
 * para que no quede en los logs de nginx; se borra de la barra en cuanto se usa.
 */
export default function DirectoPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const usado = useRef(false)

  useEffect(() => {
    if (usado.current) return
    usado.current = true
    const frag = window.location.hash.replace(/^#/, '')
    window.history.replaceState(null, '', window.location.pathname)
    const punto = frag.lastIndexOf('.')
    if (punto < 1) {
      setError('El enlace está incompleto.')
      return
    }
    void api
      .directo(decodeURIComponent(frag.slice(0, punto)), frag.slice(punto + 1))
      .then(({ sesion }) => navigate(sesion.rol === 'puerta' ? '/escanear' : '/', { replace: true }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo entrar'))
  }, [navigate])

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.marca}>
          <span className={styles.calabaza} aria-hidden />
          <div>
            <strong>PUMPKIN</strong>
            <small>Control de accesos</small>
          </div>
        </div>
        {error ? (
          <>
            <h1>No se pudo entrar</h1>
            <p className={styles.error} role="alert">
              {error}
            </p>
            <Link className={styles.boton} to="/login" replace>
              Entrar con usuario y contraseña
            </Link>
          </>
        ) : (
          <>
            <h1>Abriendo el escáner…</h1>
            <p className={styles.lead}>Validando el acceso directo de esta PDA.</p>
          </>
        )}
      </div>
    </main>
  )
}
