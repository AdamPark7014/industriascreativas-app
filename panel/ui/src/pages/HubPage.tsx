import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api, type Resumen, type Sesion } from '../api'
import styles from './hub.module.scss'

export default function HubPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [data, setData] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api
      .resumen()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error'))
  }, [])

  return (
    <main className={styles.page}>
      <header>
        <p className={styles.kicker}>Control de accesos · FICTI</p>
        <h1>Pulso de puerta</h1>
        <p className={styles.sub}>
          Entrada, salida y reingreso sobre los registros de demo. Casa del
          Terror (Hetzner) no entra aquí.
        </p>
      </header>

      {error ? <p className={styles.err}>{error}</p> : null}

      <section className={styles.kpis} aria-label="Hoy">
        <Kpi label="Dentro ahora" value={data?.dentro} />
        <Kpi label="Entradas hoy" value={data?.entradasHoy} />
        <Kpi label="Salidas hoy" value={data?.salidasHoy} />
        <Kpi label="Rechazos hoy" value={data?.rechazosHoy} />
        <Kpi label="Confirmados" value={data?.confirmados} />
      </section>

      <section className={styles.cards}>
        {sesion?.puedeOperar ? (
          <Link className={styles.card} to="/escanear">
            <strong>Escáner</strong>
            <span>PDA / USB. ENTRADA, SALIDA y reingreso.</span>
          </Link>
        ) : (
          <div className={styles.cardMuted}>
            <strong>Escáner</strong>
            <span>Solo operación interna. Tú ves informes.</span>
          </div>
        )}
        <Link className={styles.card} to="/buscar">
          <strong>Buscar e imprimir</strong>
          <span>Gafete 5×8: nombre + QR.</span>
        </Link>
        <Link className={styles.card} to="/reportes">
          <strong>Informes</strong>
          <span>Historial, CSV y Excel.</span>
        </Link>
        <Link className={styles.card} to="/zonas">
          <strong>Zonas y aforo</strong>
          <span>Acreditación y VIP.</span>
        </Link>
      </section>

      <section>
        <h2>Últimos escaneos</h2>
        <ul className={styles.lista}>
          {(data?.recientes ?? []).map((r) => (
            <li key={r.id} className={r.ok ? styles.ok : styles.mal}>
              <span>{new Date(r.creado).toLocaleTimeString('es-MX')}</span>
              <span>{r.nombre || '—'}</span>
              <span>{r.modo}</span>
              <span>{r.ok ? 'ok' : 'no'}</span>
            </li>
          ))}
          {!data?.recientes?.length ? <li className={styles.vacio}>Sin movimiento aún.</li> : null}
        </ul>
      </section>
    </main>
  )
}

function Kpi({ label, value }: { label: string; value?: number }) {
  return (
    <div className={styles.kpi}>
      <span>{label}</span>
      <strong>{value == null ? '—' : value}</strong>
    </div>
  )
}
