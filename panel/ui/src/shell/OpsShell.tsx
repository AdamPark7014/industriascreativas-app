import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api, type Sesion } from '../api'
import styles from './ops.module.scss'

type NavItem = {
  to: string
  label: string
  hint: string
  end?: boolean
  ops?: boolean
}

const GROUPS: { titulo: string; items: NavItem[] }[] = [
  {
    titulo: 'Inicio',
    items: [
      { to: '/', label: 'Resumen', hint: 'Números de hoy y accesos rápidos', end: true },
    ],
  },
  {
    titulo: 'En puerta',
    items: [
      { to: '/escanear', label: 'Escáner', hint: 'Entrada · salida · reingreso', ops: true },
      { to: '/zonas', label: 'Zonas y aforo', hint: 'Cupo por área' },
    ],
  },
  {
    titulo: 'Personas',
    items: [
      { to: '/buscar', label: 'Buscar e imprimir', hint: 'Boleto 5×8 con QR' },
      { to: '/reportes', label: 'Informes', hint: 'Historial y Excel' },
    ],
  },
]

const TITULOS: Record<string, { kicker: string; titulo: string }> = {
  '/': { kicker: 'Accesos FICTI', titulo: 'Resumen de hoy' },
  '/escanear': { kicker: 'Puerta', titulo: 'Validar boletos' },
  '/buscar': { kicker: 'Boletos', titulo: 'Buscar e imprimir' },
  '/reportes': { kicker: 'Informes', titulo: 'Historial de accesos' },
  '/zonas': { kicker: 'Aforo', titulo: 'Zonas y capacidad' },
}

export default function OpsShell() {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const location = useLocation()
  const meta = TITULOS[location.pathname] ?? TITULOS['/']

  useEffect(() => {
    void api
      .sesion()
      .then(setSesion)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'No se pudo validar la sesión'),
      )
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    setMenuAbierto(false)
  }, [location.pathname])

  const alcanceLabel =
    sesion?.alcance === 'interno'
      ? 'Operación interna'
      : sesion?.alcance === 'promotor'
        ? 'Promotor (consulta)'
        : '…'

  return (
    <div className={styles.app}>
      <aside className={`${styles.lateral} ${menuAbierto ? styles.abierto : ''}`}>
        <div className={styles.marca}>
          <img src="/static/img/ficti-logo.png" alt="FICTI" />
          <img
            className={styles.tech}
            src="/static/img/tech-capital-logo.png"
            alt="Tech Capital"
          />
        </div>

        <nav className={styles.nav} aria-label="Accesos">
          {GROUPS.map((g) => (
            <div key={g.titulo} className={styles.grupo}>
              <p className={styles.navTitulo}>{g.titulo}</p>
              {g.items
                .filter((n) => !n.ops || sesion?.puedeOperar)
                .map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      `${styles.navItem} ${isActive ? styles.activo : ''}`
                    }
                  >
                    <span className={styles.navLabel}>{n.label}</span>
                    <span className={styles.navHint}>{n.hint}</span>
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>

        <div className={styles.pie}>
          <div className={styles.usuario}>
            <span>
              Sesión: <b>{sesion?.nombre ?? (cargando ? '…' : '—')}</b>
            </span>
            <a href="/logout">Salir</a>
          </div>
          <a className={styles.volver} href="/">
            ← Volver al panel de registros
          </a>
          <img
            className={styles.gabor}
            src="/static/img/gabor-logo-footer.png"
            alt="Gabor Grupo Papelero"
          />
        </div>
      </aside>

      {menuAbierto ? (
        <button
          type="button"
          className={styles.capa}
          aria-label="Cerrar menú"
          onClick={() => setMenuAbierto(false)}
        />
      ) : null}

      <div className={styles.principal}>
        <header className={styles.cabecera}>
          <button
            type="button"
            className={styles.menuBtn}
            aria-label="Menú"
            onClick={() => setMenuAbierto((v) => !v)}
          >
            ≡
          </button>
          <div className={styles.cabeceraTexto}>
            <p className={styles.kicker}>{meta.kicker}</p>
            <h1 className={styles.titulo}>{meta.titulo}</h1>
          </div>
          <div className={styles.cabeceraAcciones}>
            <span
              className={`${styles.insignia} ${
                sesion?.alcance === 'interno' ? styles.insigniaInterno : styles.insigniaPromotor
              }`}
            >
              <span className={styles.insigniaPunto} />
              {alcanceLabel}
            </span>
            <span className={styles.sello}>
              <span className={styles.selloPunto} />
              En vivo
            </span>
          </div>
        </header>

        {error ? (
          <div className={styles.aviso} role="alert">
            {error === 'sesion' || error === 'sesion_expirada'
              ? 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.'
              : error}
          </div>
        ) : null}

        {cargando && !sesion ? (
          <div className={styles.cargando}>Comprobando sesión…</div>
        ) : (
          <Outlet context={sesion} />
        )}
      </div>
    </div>
  )
}
