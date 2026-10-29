import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, tiene, type Jornada, type Permiso, type Sesion } from '../api'
import marca from './marca.module.scss'
import styles from './ops.module.scss'

type NavItem = { to: string; label: string; hint: string; end?: boolean; permiso: Permiso }

/** Mismo menú por grupos que el panel de FICTI (panel/ui/src/shell/OpsShell.tsx). */
const GROUPS: { titulo: string; items: NavItem[] }[] = [
  {
    titulo: 'Inicio',
    items: [{ to: '/', label: 'Resumen', hint: 'Dentro ahora y números de la jornada', end: true, permiso: 'resumen' }],
  },
  {
    titulo: 'En puerta',
    items: [
      { to: '/escanear', label: 'Escáner', hint: 'Entrada · salida · reingreso', permiso: 'escanear' },
      { to: '/pases', label: 'Pases QR', hint: 'Los 250 pases, titular y bloqueo', permiso: 'pases' },
    ],
  },
  {
    titulo: 'Informes',
    items: [{ to: '/historial', label: 'Historial de accesos', hint: 'Por jornada, filtros y CSV', permiso: 'informes' }],
  },
]

const TITULOS: Record<string, { kicker: string; titulo: string }> = {
  '/': { kicker: 'Accesos PUMPKIN', titulo: 'Resumen de la jornada' },
  '/escanear': { kicker: 'Puerta', titulo: 'Validar pases' },
  '/pases': { kicker: 'Lote QR-001 a QR-250', titulo: 'Pases QR' },
  '/historial': { kicker: 'Informes', titulo: 'Historial de accesos' },
}

function Marca({ chica = false }: { chica?: boolean }) {
  return (
    <span className={`${marca.marca} ${chica ? marca.chica : ''}`}>
      <span className={marca.calabaza} aria-hidden>
        ●
      </span>
      <span>
        <strong>PUMPKIN</strong>
        <small>Accesos</small>
      </span>
    </span>
  )
}

function JornadaChip({ jornada }: { jornada?: Jornada | null }) {
  if (!jornada) return null
  return (
    <span
      className={styles.diaChip}
      title={`La jornada cambia a las ${jornada.corteHora}:00 (hora de México)`}
    >
      Jornada <small>· {jornada.nombre}</small>
    </span>
  )
}

export default function Shell() {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const meta = TITULOS[location.pathname] ?? TITULOS['/']

  useEffect(() => {
    void api
      .sesion()
      .then(setSesion)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo validar la sesión'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => setMenuAbierto(false), [location.pathname])

  useEffect(() => {
    document.title = `${meta.titulo} · Accesos PUMPKIN`
  }, [meta.titulo])

  if (error === 'sesion') {
    return <Navigate to="/login" replace state={{ desde: location.pathname }} />
  }

  const salir = async () => {
    await api.logout().catch(() => undefined)
    navigate('/login', { replace: true })
  }

  const grupos = GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => tiene(sesion, n.permiso)) })).filter(
    (g) => g.items.length,
  )
  const items = grupos.flatMap((g) => g.items)
  // La PDA (una sola pantalla) va sin menú lateral: barra arriba, como la puerta de FICTI.
  const enfocado = Boolean(sesion) && items.length <= 1

  const cuerpo = (
    <>
      {error ? (
        <div className={styles.aviso} role="alert">
          {error}
        </div>
      ) : null}
      {cargando && !sesion ? (
        <div className={styles.cargando} aria-label="Cargando">
          <span className={styles.esqueletoLinea} />
          <span className={styles.esqueletoBloque} />
          <span className={styles.esqueletoBloque} />
        </div>
      ) : (
        <Outlet context={sesion} />
      )}
    </>
  )

  if (enfocado) {
    return (
      <div className={`${styles.app} ${styles.appEnfocado}`}>
        <header className={styles.barra}>
          <div className={styles.barraMarca}>
            <Marca chica />
          </div>
          <div className={styles.cabeceraTexto}>
            <p className={styles.kicker}>{meta.kicker}</p>
            <h1 className={styles.titulo}>{meta.titulo}</h1>
          </div>
          <div className={styles.cabeceraAcciones}>
            <JornadaChip jornada={sesion?.jornada} />
            <span className={`${styles.insignia} ${styles.insigniaPromotor}`} title={sesion?.usuario}>
              <span className={styles.insigniaPunto} />
              {sesion?.nombre ?? '…'}
            </span>
            <button type="button" className={`${styles.salir} ${marca.botonSalir}`} onClick={() => void salir()}>
              Salir
            </button>
          </div>
        </header>
        <div className={`${styles.principal} ${styles.principalEnfocado}`}>{cuerpo}</div>
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <aside className={`${styles.lateral} ${menuAbierto ? styles.abierto : ''}`}>
        <div className={styles.marca}>
          <Marca />
        </div>
        <nav className={styles.nav} aria-label="Accesos" aria-busy={cargando}>
          {cargando && !sesion ? [0, 1, 2].map((i) => <span key={i} className={styles.navEsqueleto} />) : null}
          {grupos.map((g) => (
            <div key={g.titulo} className={styles.grupo}>
              <p className={styles.navTitulo}>{g.titulo}</p>
              {g.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) => `${styles.navItem} ${isActive ? styles.activo : ''}`}
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
            <button type="button" className={marca.enlaceSalir} onClick={() => void salir()}>
              Salir
            </button>
          </div>
        </div>
      </aside>

      {menuAbierto ? (
        <button type="button" className={styles.capa} aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)} />
      ) : null}

      <div className={styles.principal}>
        <header className={styles.cabecera}>
          <button type="button" className={styles.menuBtn} aria-label="Menú" onClick={() => setMenuAbierto((v) => !v)}>
            ≡
          </button>
          <div className={styles.cabeceraTexto}>
            <p className={styles.kicker}>{meta.kicker}</p>
            <h1 className={styles.titulo}>{meta.titulo}</h1>
          </div>
          <div className={styles.cabeceraAcciones}>
            <JornadaChip jornada={sesion?.jornada} />
            <span className={`${styles.insignia} ${styles.insigniaInterno}`}>
              <span className={styles.insigniaPunto} />
              {sesion?.rolNombre ?? '…'}
            </span>
            <span className={styles.sello}>
              <span className={styles.selloPunto} />
              En vivo
            </span>
          </div>
        </header>
        {cuerpo}
      </div>
    </div>
  )
}
