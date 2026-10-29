import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import styles from './login.module.scss'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    document.title = 'Entrar · Accesos PUMPKIN'
    // Si la PDA ya tiene sesión, directo a su pantalla.
    void api
      .sesion()
      .then((s) => navigate(s.rol === 'puerta' ? '/escanear' : '/', { replace: true }))
      .catch(() => undefined)
  }, [navigate])

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      const { sesion } = await api.login(usuario, clave)
      const desde = (location.state as { desde?: string } | null)?.desde
      navigate(sesion.rol === 'puerta' ? '/escanear' : desde || '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar')
      setEnviando(false)
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={(e) => void entrar(e)}>
        <div className={styles.marca}>
          <span className={styles.calabaza} aria-hidden />
          <div>
            <strong>PUMPKIN</strong>
            <small>Control de accesos</small>
          </div>
        </div>
        <h1>Entrar</h1>
        <p className={styles.lead}>Cada PDA entra con su usuario y se queda con la sesión abierta.</p>

        <label htmlFor="usuario">Usuario</label>
        <input
          id="usuario"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          placeholder="puerta1"
          required
          autoFocus
        />
        <label htmlFor="clave">Contraseña</label>
        <input
          id="clave"
          type="password"
          autoComplete="current-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          required
        />
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <p className={styles.pista}>
          ¿PDA nueva? Escanea con la cámara el QR de acceso directo de su usuario y entra sin escribir nada.
        </p>
      </form>
    </main>
  )
}
