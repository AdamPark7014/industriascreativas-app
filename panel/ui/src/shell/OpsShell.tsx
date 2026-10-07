import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api, tiene, type Permiso, type Sesion } from '../api'
import styles from './ops.module.scss'

type NavItem = {
  to: string
  label: string
  hint: string
  end?: boolean
  /** Se muestra si la sesión tiene alguno de estos permisos. */
  permisos: Permiso[]
}

/** Quién puede abrir el resumen (GET /resumen en accesos-api). */
export const PERMISOS_RESUMEN: Permiso[] = ['informes', 'mesa', 'escanear']

const GROUPS: { titulo: string; items: NavItem[] }[] = [
  {
    titulo: 'Inicio',
    items: [
      { to: '/', label: 'Resumen', hint: 'Números de hoy y accesos rápidos', end: true, permisos: PERMISOS_RESUMEN },
    ],
  },
  {
    titulo: 'Mesa de atención',
    items: [
      { to: '/registro', label: 'Registro en sitio', hint: 'Alta sin registro previo + etiqueta', permisos: ['registrar'] },
      { to: '/buscar', label: 'Buscar e imprimir', hint: 'Ficha, reenvío por correo y etiqueta', permisos: ['buscar'] },
      { to: '/mesa', label: 'Actividad de la mesa', hint: 'Quién registró, imprimió o reenvió', permisos: ['mesa'] },
    ],
  },
  {
    titulo: 'En puerta',
    items: [
      { to: '/escanear', label: 'Escáner', hint: 'Entrada · salida · reingreso', permisos: ['escanear'] },
      { to: '/zonas', label: 'Zonas y aforo', hint: 'Cupo por área', permisos: ['escanear', 'informes'] },
    ],
  },
  {
    titulo: 'Informes',
    items: [{ to: '/reportes', label: 'Historial de accesos', hint: 'Filtros y Excel', permisos: ['informes'] }],
  },
]

const TITULOS: Record<string, { kicker: string; titulo: string }> = {
  '/': { kicker: 'Accesos FICTI', titulo: 'Resumen de hoy' },
  '/registro': { kicker: 'Mesa de registro', titulo: 'Registro en sitio' },
  '/buscar': { kicker: 'Mesa de atención', titulo: 'Buscar, reenviar e imprimir' },
  '/mesa': { kicker: 'Mesa de atención', titulo: 'Actividad de la mesa' },
  '/escanear': { kicker: 'Puerta', titulo: 'Validar boletos' },
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

  useEffect(() => {
    document.title = `${meta.titulo} · Accesos FICTI`
  }, [meta.titulo])

  const expirada = error === 'sesion' || error === 'sesion_expirada'

  const grupos = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => n.permisos.some((p) => tiene(sesion, p))),
  })).filter((g) => g.items.length)

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

        <nav className={styles.nav} aria-label="Accesos" aria-busy={cargando}>
          {cargando && !sesion
            ? [0, 1, 2, 3].map((i) => <span key={i} className={styles.navEsqueleto} />)
            : null}
          {grupos.map((g) => (
            <div key={g.titulo} className={styles.grupo}>
              <p className={styles.navTitulo}>{g.titulo}</p>
              {g.items.map((n) => (
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
          {tiene(sesion, 'panel_datos') ? (
            <a className={styles.volver} href="/">
              ← Volver al panel de registros
            </a>
          ) : null}
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
              {sesion?.rolNombre ?? '…'}
            </span>
            <span className={styles.sello}>
              <span className={styles.selloPunto} />
              En vivo
            </span>
          </div>
        </header>

        {error ? (
          <div className={styles.aviso} role="alert">
            {expirada ? (
              <>
                Tu sesión expiró. <a href="/login">Vuelve a iniciar sesión</a> para continuar.
              </>
            ) : (
              error
            )}
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
      </div>
    </div>
  )
}
