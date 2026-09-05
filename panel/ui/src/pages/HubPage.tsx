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
        Bienvenido a Accesos FICTI. Aquí controlas quién entra y sale, imprimes boletos
        de puerta y revisas lo que pasó hoy.
      </p>

      {error ? <div className={styles.alerta}>{error}</div> : null}

      <section className={styles.ahora} aria-label="Qué hacer ahora">
        <h2>¿Qué necesitas hacer?</h2>
        <div className={styles.ahoraGrid}>
          {sesion?.puedeOperar ? (
            <Link className={styles.ahoraCard} to="/escanear">
              <span className={styles.ahoraNum}>A</span>
              <div>
                <strong>Validar en puerta</strong>
                <p>Escanea QR: entrada, salida o reingreso.</p>
              </div>
            </Link>
          ) : null}
          <Link className={styles.ahoraCard} to="/buscar">
            <span className={styles.ahoraNum}>B</span>
            <div>
              <strong>{sesion?.puedeImprimir ? 'Imprimir un boleto' : 'Buscar una persona'}</strong>
              <p>
                {sesion?.puedeImprimir
                  ? 'Busca por nombre o folio y saca el gafete 5×8.'
                  : 'Consulta acreditaciones (sin imprimir).'}
              </p>
            </div>
          </Link>
          <Link className={styles.ahoraCard} to="/reportes">
            <span className={styles.ahoraNum}>C</span>
            <div>
              <strong>Ver informes</strong>
              <p>Historial del día, filtros y exportar Excel.</p>
            </div>
          </Link>
        </div>
      </section>

      <section className={styles.kpis} aria-label="Números de hoy">
        <Kpi label="Personas dentro" value={data?.dentro} loading={loading} accent="navy" />
        <Kpi label="Entradas hoy" value={data?.entradasHoy} loading={loading} />
        <Kpi label="Salidas hoy" value={data?.salidasHoy} loading={loading} />
        <Kpi label="Rechazos hoy" value={data?.rechazosHoy} loading={loading} accent="warn" />
        <Kpi label="Confirmados" value={data?.confirmados} loading={loading} />
      </section>

      <section className={styles.modulos} aria-label="Todas las herramientas">
        {sesion?.puedeOperar ? (
          <Link className={styles.modulo} to="/escanear">
            <span className={styles.moduloTag}>Puerta</span>
            <strong>Escáner</strong>
            <span>Estación con lector USB o PDA. Verde = entrada, rosa = salida.</span>
          </Link>
        ) : (
          <div className={`${styles.modulo} ${styles.moduloOff}`}>
            <span className={styles.moduloTag}>Puerta</span>
            <strong>Escáner</strong>
            <span>Solo operación interna. Tu rol ve informes y búsquedas.</span>
          </div>
        )}
        <Link className={styles.modulo} to="/buscar">
          <span className={styles.moduloTag}>Boletos</span>
          <strong>Buscar e imprimir</strong>
          <span>Localiza a alguien e imprime su boleto con QR (5×8).</span>
        </Link>
        <Link className={styles.modulo} to="/reportes">
          <span className={styles.moduloTag}>Informes</span>
          <strong>Historial</strong>
          <span>Quién entró o salió, con CSV y Excel.</span>
        </Link>
        <Link className={styles.modulo} to="/zonas">
          <span className={styles.moduloTag}>Aforo</span>
          <strong>Zonas</strong>
          <span>Cuántas personas caben en cada área (p. ej. VIP).</span>
        </Link>
      </section>

      <section className={styles.tarjeta}>
        <div className={styles.tarjetaCab}>
          <h2>Actividad reciente</h2>
          <p>Últimos escaneos — se actualiza sola cada 15 s.</p>
        </div>
        {loading && !data ? (
          <p className={styles.vacio}>Cargando actividad…</p>
        ) : !data?.recientes?.length ? (
          <div className={styles.vacioRico}>
            <strong>Aún no hay escaneos</strong>
            <p>
              Cuando la puerta esté lista, abre el escáner y empieza a validar.
              Los resultados aparecerán aquí.
            </p>
            {sesion?.puedeOperar ? (
              <Link to="/escanear" className={styles.ctaVacio}>
                Ir al escáner →
              </Link>
            ) : null}
          </div>
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
                <span className={styles.modo}>
                  {r.modo === 'entrada' ? 'Entrada' : r.modo === 'salida' ? 'Salida' : r.modo}
                </span>
                <span className={styles.estado}>{r.ok ? 'OK' : 'Rechazado'}</span>
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
    <article
      className={`${styles.kpi} ${accent === 'navy' ? styles.kpiNavy : ''} ${accent === 'warn' ? styles.kpiWarn : ''}`}
    >
      <span>{label}</span>
      <strong>
        {loading && value == null ? '…' : value == null ? '—' : value.toLocaleString('es-MX')}
      </strong>
    </article>
  )
}
