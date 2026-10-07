import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api, mesa, tiene, type MesaResp, type Resumen, type Sesion } from '../api'
import styles from './hub.module.scss'

function textoBienvenida(sesion: Sesion | null): string {
  if (sesion?.puedeOperar) {
    return 'Desde aquí operas todo el evento: puerta, mesa de atención, impresión de gafetes e informes.'
  }
  if (tiene(sesion, 'registrar') && tiene(sesion, 'buscar')) {
    return 'Registra a quien llega sin registro, atiende a los ya registrados (ficha, reenvío del boleto y etiqueta) y sigue lo que pasa hoy.'
  }
  return 'Consulta los números del día, la actividad de la mesa y el historial de accesos.'
}

export default function HubPage() {
  const sesion = useOutletContext<Sesion | null>()
  const verMesa = tiene(sesion, 'mesa')
  const verPuerta = tiene(sesion, 'escanear') || tiene(sesion, 'informes')
  const verMetricas = tiene(sesion, 'metricas')
  const [data, setData] = useState<Resumen | null>(null)
  const [mesaHoy, setMesaHoy] = useState<MesaResp['hoy'] | null>(null)
  const [latency, setLatency] = useState<{
    p50: number | null
    p95: number | null
    n: number
    devices: { dispositivo: string; n: number; p50: number | null }[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    const cargar = () => {
      void api
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
      if (verMesa) {
        void mesa
          .actividad()
          .then((m) => {
            if (vivo) setMesaHoy(m.hoy)
          })
          .catch(() => undefined)
      }
      if (!verMetricas) return
      void api
        .metricas()
        .then((m) => {
          if (!vivo) return
          setLatency({
            p50: m.hoy.p50,
            p95: m.hoy.p95,
            n: m.hoy.n,
            devices: m.devices.slice(0, 6).map((d) => ({
              dispositivo: d.dispositivo,
              n: d.n,
              p50: d.p50,
            })),
          })
        })
        .catch(() => undefined)
    }

    void cargar()
    const id = window.setInterval(() => void cargar(), 15000)
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [verMesa, verMetricas])

  return (
    <main className={styles.page}>
      <p className={styles.lead}>
        Hola{sesion?.nombre ? `, ${sesion.nombre}` : ''}. {textoBienvenida(sesion)}
      </p>

      {error ? <div className={styles.alerta}>{error}</div> : null}

      {latency ? (
        <section className={styles.kpis} aria-label="Latencia de escaneo hoy">
          <Kpi
            label="Escaneos medidos"
            value={latency.n}
            loading={false}
          />
          <Kpi
            label="p50 server"
            value={latency.p50 != null ? Math.round(latency.p50) : null}
            loading={false}
            suffix="ms"
          />
          <Kpi
            label="p95 server"
            value={latency.p95 != null ? Math.round(latency.p95) : null}
            loading={false}
            suffix="ms"
            accent="warn"
          />
          <article className={styles.kpi}>
            <span>Estaciones activas</span>
            <strong>{latency.devices.length || '—'}</strong>
          </article>
        </section>
      ) : null}

      <section className={styles.ahora} aria-label="Qué hacer ahora">
        <h2>¿Qué necesitas hacer?</h2>
        <div className={styles.ahoraGrid}>
          {tiene(sesion, 'registrar') ? (
            <Link className={styles.ahoraCard} to="/registro">
              <span className={styles.ahoraNum}>+</span>
              <div>
                <strong>Registrar a alguien en sitio</strong>
                <p>Quien llega sin registro: sus datos y su etiqueta de 8 cm al momento.</p>
              </div>
            </Link>
          ) : null}
          {tiene(sesion, 'buscar') ? (
            <Link className={styles.ahoraCard} to="/buscar">
              <span className={styles.ahoraNum}>⌕</span>
              <div>
                <strong>Buscar a un registrado</strong>
                <p>
                  {sesion?.puedeImprimir
                    ? 'Ficha completa, reenvío del boleto por correo y etiqueta impresa.'
                    : 'Ficha completa y reenvío del boleto por correo.'}
                </p>
              </div>
            </Link>
          ) : null}
          {tiene(sesion, 'mesa') ? (
            <Link className={styles.ahoraCard} to="/mesa">
              <span className={styles.ahoraNum}>≡</span>
              <div>
                <strong>Actividad de la mesa</strong>
                <p>Altas, impresiones y reenvíos de hoy por usuario.</p>
              </div>
            </Link>
          ) : null}
          {sesion?.puedeOperar ? (
            <Link className={styles.ahoraCard} to="/escanear">
              <span className={styles.ahoraNum}>▣</span>
              <div>
                <strong>Validar en puerta</strong>
                <p>Escanea QR: entrada, salida o reingreso.</p>
              </div>
            </Link>
          ) : null}
          {tiene(sesion, 'informes') ? (
            <Link className={styles.ahoraCard} to="/reportes">
              <span className={styles.ahoraNum}>↗</span>
              <div>
                <strong>Ver informes</strong>
                <p>Historial del día, filtros y exportar Excel.</p>
              </div>
            </Link>
          ) : null}
          {verPuerta ? (
            <Link className={styles.ahoraCard} to="/zonas">
              <span className={styles.ahoraNum}>◫</span>
              <div>
                <strong>Zonas y aforo</strong>
                <p>Cuántas personas hay y caben en cada área.</p>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      {verMesa ? (
        <section className={styles.kpis} aria-label="Mesa de atención hoy">
          <Kpi label="Altas en sitio hoy" value={mesaHoy?.altas} loading={!mesaHoy} accent="navy" />
          <Kpi label="Etiquetas impresas hoy" value={mesaHoy?.impresiones} loading={!mesaHoy} />
          <Kpi label="Boletos reenviados hoy" value={mesaHoy?.reenvios} loading={!mesaHoy} />
          <Kpi label="Reenvíos fallidos hoy" value={mesaHoy?.fallos} loading={!mesaHoy} accent="warn" />
        </section>
      ) : null}

      {verPuerta ? (
        <section className={styles.kpis} aria-label="Puerta hoy">
          <Kpi label="Personas dentro" value={data?.dentro} loading={loading} accent="navy" />
          <Kpi label="Entradas hoy" value={data?.entradasHoy} loading={loading} />
          <Kpi label="Salidas hoy" value={data?.salidasHoy} loading={loading} />
          <Kpi label="Rechazos hoy" value={data?.rechazosHoy} loading={loading} accent="warn" />
          <Kpi label="Confirmados" value={data?.confirmados} loading={loading} />
        </section>
      ) : null}

      {verPuerta ? (
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
      ) : null}
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
      className={`${styles.kpi} ${accent === 'navy' ? styles.kpiNavy : ''} ${accent === 'warn' ? styles.kpiWarn : ''}`}
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
