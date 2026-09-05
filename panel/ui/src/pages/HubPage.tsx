import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type Resumen, type Sesion } from '../api'
import styles from './hub.module.scss'

export default function HubPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [data, setData] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    const cargar = () =>
      api
        .resumen()
        .then((d) => {
          if (vivo) {
            setData(d)
            setError(null)
          }
        })
        .catch((e: unknown) => {
          if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen')
        })
        .finally(() => {
          if (vivo) setLoading(false)
        })

    void cargar()
    const id = window.setInterval(() => void cargar(), 15000)
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <main className={styles.page}>
      <p className={styles.lead}>
        Operación de puerta del evento FICTI / Tech Capital. Entrada, salida y
        reingreso sobre los registros confirmados.
      </p>

      {error ? <div className={styles.alerta}>{error}</div> : null}

      <section className={styles.kpis} aria-label="Indicadores de hoy">
        <Kpi label="Personas dentro" value={data?.dentro} loading={loading} accent="navy" />
        <Kpi label="Entradas hoy" value={data?.entradasHoy} loading={loading} />
        <Kpi label="Salidas hoy" value={data?.salidasHoy} loading={loading} />
        <Kpi label="Rechazos hoy" value={data?.rechazosHoy} loading={loading} accent="warn" />
        <Kpi label="Registros confirmados" value={data?.confirmados} loading={loading} />
      </section>

      <section className={styles.modulos} aria-label="Módulos">
        {sesion?.puedeOperar ? (
          <Link className={styles.modulo} to="/escanear">
            <span className={styles.moduloTag}>Puerta</span>
            <strong>Escáner de acceso</strong>
            <span>Estación PDA o USB. Entrada, salida y reingreso controlado.</span>
          </Link>
        ) : (
          <div className={`${styles.modulo} ${styles.moduloOff}`}>
            <span className={styles.moduloTag}>Puerta</span>
            <strong>Escáner de acceso</strong>
            <span>Reservado a operación interna. Tu rol ve informes y búsqueda.</span>
          </div>
        )}
        <Link className={styles.modulo} to="/buscar">
          <span className={styles.moduloTag}>Acreditación</span>
          <strong>Buscar e imprimir</strong>
          <span>Localiza por nombre, correo o folio e imprime gafete 5×8.</span>
        </Link>
        <Link className={styles.modulo} to="/reportes">
          <span className={styles.moduloTag}>Análisis</span>
          <strong>Informes</strong>
          <span>Historial de escaneos con filtros, CSV y Excel.</span>
        </Link>
        <Link className={styles.modulo} to="/zonas">
          <span className={styles.moduloTag}>Aforo</span>
          <strong>Zonas</strong>
          <span>Acreditación y VIP con tope de capacidad.</span>
        </Link>
      </section>

      <section className={styles.tarjeta}>
        <div className={styles.tarjetaCab}>
          <h2>Actividad reciente</h2>
          <p>Últimos escaneos registrados en panel y demo.</p>
        </div>
        {loading && !data ? (
          <p className={styles.vacio}>Cargando actividad…</p>
        ) : !data?.recientes?.length ? (
          <p className={styles.vacio}>Todavía no hay escaneos. Abre el escáner cuando la puerta esté lista.</p>
        ) : (
          <ul className={styles.lista}>
            {data.recientes.map((r) => (
              <li key={r.id} className={r.ok ? styles.ok : styles.mal}>
                <time dateTime={r.creado}>
                  {new Date(r.creado).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </time>
                <span className={styles.nombre}>{r.nombre || 'Código no reconocido'}</span>
                <span className={styles.modo}>{r.modo}</span>
                <span className={styles.estado}>{r.ok ? 'Aceptado' : 'Rechazado'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function Kpi({
  label,
  value,
  loading,
  accent,
}: {
  label: string
  value?: number
  loading?: boolean
  accent?: 'navy' | 'warn'
}) {
  return (
    <article className={`${styles.kpi} ${accent === 'navy' ? styles.kpiNavy : ''} ${accent === 'warn' ? styles.kpiWarn : ''}`}>
      <span>{label}</span>
      <strong>{loading && value == null ? '…' : value == null ? '—' : value.toLocaleString('es-MX')}</strong>
    </article>
  )
}
