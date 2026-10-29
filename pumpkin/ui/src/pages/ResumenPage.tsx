import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api, fmtHora, tiene, type Resumen, type Sesion } from '../api'
import styles from './hub.module.scss'
import t from './tablas.module.scss'

/** Igual que el resumen de FICTI (HubPage) pero para los 250 pases de una sola puerta. */
export default function ResumenPage() {
  const sesion = useOutletContext<Sesion | null>()
  const hoy = sesion?.jornada.fecha
  const [jornada, setJornada] = useState<string | undefined>(undefined)
  const [data, setData] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fecha = jornada ?? hoy
  const enVivo = !jornada || jornada === hoy

  useEffect(() => {
    let vivo = true
    const cargar = () =>
      api
        .resumen(fecha)
        .then((d) => {
          if (vivo) {
            setData(d)
            setError(null)
          }
        })
        .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar'))
    void cargar()
    const id = enVivo ? window.setInterval(cargar, 10_000) : 0
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [fecha, enVivo])

  const cargando = !data
  const total = data?.pases.total ?? sesion?.totalPases ?? 250
  const jornadas = data?.jornadas ?? []
  const opciones = hoy && !jornadas.some((j) => j.jornada === hoy) ? [{ jornada: hoy, nombre: sesion?.jornada.nombre ?? hoy, entradas: 0, escaneos: 0 }, ...jornadas] : jornadas

  return (
    <main className={styles.page}>
      <div className={t.barraFiltros}>
        <p className={styles.lead}>
          {enVivo
            ? 'Lo que pasa en la puerta en esta jornada. Se actualiza solo cada 10 s.'
            : 'Jornada anterior: números cerrados.'}
        </p>
        <label className={t.filtro}>
          <span>Jornada</span>
          <select value={fecha ?? ''} onChange={(e) => setJornada(e.target.value === hoy ? undefined : e.target.value)}>
            {opciones.map((j) => (
              <option key={j.jornada} value={j.jornada}>
                {j.nombre}
                {j.jornada === hoy ? ' (hoy)' : ''} · {j.entradas} entradas
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <div className={t.aviso}>{error}</div> : null}

      <section className={styles.kpis} aria-label="Puerta">
        <Kpi label={enVivo ? 'Dentro ahora' : 'Quedaron dentro'} value={data?.dentro} loading={cargando} accent="navy" suffix={`/ ${data?.aforo || total}`} />
        <Kpi label="Pases distintos que entraron" value={data?.unicos} loading={cargando} />
        <Kpi label="Entradas" value={data?.entradas} loading={cargando} />
        <Kpi label="Reingresos" value={data?.reingresos} loading={cargando} />
        <Kpi label="Salidas" value={data?.salidas} loading={cargando} />
        <Kpi label="Rechazos" value={data?.rechazos} loading={cargando} accent="warn" />
        <Kpi label="Pases bloqueados" value={data?.pases.bloqueados} loading={cargando} accent="warn" />
      </section>

      <section className={styles.ahora} aria-label="Qué hacer ahora">
        <h2>¿Qué necesitas hacer?</h2>
        <div className={styles.ahoraGrid}>
          {sesion?.puedeOperar ? (
            <Link className={styles.ahoraCard} to="/escanear">
              <span className={styles.ahoraNum}>▣</span>
              <div>
                <strong>Validar en puerta</strong>
                <p>Escanea un pase: entrada, salida o reingreso.</p>
              </div>
            </Link>
          ) : null}
          {tiene(sesion, 'pases') ? (
            <Link className={styles.ahoraCard} to="/pases">
              <span className={styles.ahoraNum}>⌕</span>
              <div>
                <strong>Buscar un pase</strong>
                <p>Quién está dentro, ponerle titular a un pase o bloquearlo.</p>
              </div>
            </Link>
          ) : null}
          {tiene(sesion, 'informes') ? (
            <Link className={styles.ahoraCard} to="/historial">
              <span className={styles.ahoraNum}>↗</span>
              <div>
                <strong>Historial y CSV</strong>
                <p>Cada lectura con hora, PDA y resultado; descarga para Excel.</p>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      <section className={styles.tarjeta}>
        <div className={styles.tarjetaCab}>
          <h2>Por PDA</h2>
          <p>Qué registró cada usuario de puerta en la jornada.</p>
        </div>
        {!data?.porOperador.length ? (
          <p className={styles.vacio}>{cargando ? 'Cargando…' : 'Ninguna PDA ha escaneado en esta jornada.'}</p>
        ) : (
          <div className={t.scroll}>
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Entradas</th>
                  <th>Reingresos</th>
                  <th>Salidas</th>
                  <th>Rechazos</th>
                  <th>Último</th>
                  <th>Estación</th>
                </tr>
              </thead>
              <tbody>
                {data.porOperador.map((o) => (
                  <tr key={o.operador}>
                    <td>
                      <b>{o.operador}</b>
                      {o.nombre && o.nombre !== o.operador ? <small> · {o.nombre}</small> : null}
                    </td>
                    <td>{o.entradas}</td>
                    <td>{o.reingresos}</td>
                    <td>{o.salidas}</td>
                    <td className={o.rechazos ? t.mal : ''}>{o.rechazos}</td>
                    <td>{fmtHora(o.ultimo)}</td>
                    <td>{o.dispositivo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.tarjeta}>
        <div className={styles.tarjetaCab}>
          <h2>Actividad reciente</h2>
          <p>Últimas lecturas de la puerta{enVivo ? ' — se actualiza sola' : ''}.</p>
        </div>
        {!data?.recientes.length ? (
          <div className={styles.vacioRico}>
            <strong>{cargando ? 'Cargando…' : 'Aún no hay escaneos'}</strong>
            {!cargando ? <p>Cuando las PDA empiecen a validar, cada lectura aparecerá aquí.</p> : null}
          </div>
        ) : (
          <ul className={styles.lista}>
            {data.recientes.map((r) => (
              <li key={r.id} className={r.ok ? styles.ok : styles.mal}>
                <time dateTime={r.creado}>{fmtHora(r.creado, true)}</time>
                <span className={styles.nombre}>
                  {r.pase ? `${r.titular ? `${r.titular} · ` : ''}${r.pase}` : `«${r.leido.slice(0, 24)}»`}
                  {r.operador ? <small> · {r.operador}</small> : null}
                </span>
                <span className={styles.modo}>{r.modo === 'entrada' ? (r.reingreso ? 'Reingreso' : 'Entrada') : 'Salida'}</span>
                <span className={styles.estado}>{r.ok ? 'OK' : r.codigo === 'COOLDOWN' ? 'Duplicado' : r.mensaje}</span>
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
  suffix,
}: {
  label: string
  value?: number | null
  loading?: boolean
  accent?: 'navy' | 'warn'
  suffix?: string
}) {
  return (
    <article
      className={`${styles.kpi} ${accent === 'navy' ? styles.kpiNavy : ''} ${accent === 'warn' && (value ?? 0) > 0 ? styles.kpiWarn : ''}`}
    >
      <span>{label}</span>
      <strong>
        {loading && value == null
          ? '…'
          : value == null
            ? '—'
            : `${value.toLocaleString('es-MX')}${suffix ? ` ${suffix}` : ''}`}
      </strong>
    </article>
  )
}
