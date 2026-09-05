import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { api, type Sesion } from '../api'
import styles from './ops.module.scss'

const NAV: { to: string; label: string; end?: boolean; ops?: boolean }[] = [
  { to: '/', label: 'Pulso', end: true },
  { to: '/escanear', label: 'Escáner', ops: true },
  { to: '/buscar', label: 'Buscar / imprimir' },
  { to: '/reportes', label: 'Informes' },
  { to: '/zonas', label: 'Zonas' },
]

export default function OpsShell() {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api
      .sesion()
      .then(setSesion)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error'))
  }, [])

  return (
    <div className={styles.app}>
      <header className={styles.top}>
        <a className={styles.brand} href="/">
          <img src="/static/img/ficti-logo.png" alt="FICTI" />
          <span>Accesos</span>
        </a>
        <nav className={styles.nav}>
          {NAV.filter((n) => !n.ops || sesion?.puedeOperar).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => (isActive ? styles.active : undefined)}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.meta}>
          {sesion ? (
            <span>
              {sesion.nombre} · {sesion.alcance}
            </span>
          ) : null}
          <a href="/">Panel</a>
        </div>
      </header>
      {error ? <p className={styles.error}>{error}</p> : null}
      <Outlet context={sesion} />
    </div>
  )
}
