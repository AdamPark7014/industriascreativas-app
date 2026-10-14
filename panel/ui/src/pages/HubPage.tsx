import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api, mesa, tiene, type EstadoCorreo, type MesaResp, type Resumen, type Sesion } from '../api'
import DiaSelector from '../components/DiaSelector'
import { useDiaSeleccionado } from '../lib/useDia'
import styles from './hub.module.scss'

// Cada registro gasta 2 créditos (enlace + gafete); con menos de esto no alcanza el día.
const CREDITOS_MINIMOS = 1000

/** Aviso del inicio cuando los correos no van a salir (oct-2026: dos días sin créditos sin que nadie lo viera). */
function avisoCorreo(c: EstadoCorreo | null): string | null {
  if (!c) return null
  if (!c.ok) {
    return `No se pudo consultar Brevo (${c.error || c.mensaje || 'sin respuesta'}). Revisa que los correos estén saliendo.`
  }
  if (c.remitenteValido === false) {
    return `Brevo no tiene validado el remitente ${c.remitente ?? ''}: acepta los correos y luego los tira. Autentica el dominio en Brevo.`
  }
  if (c.creditos != null && c.creditos <= 0) {
    return 'Brevo se quedó sin créditos: no sale ningún correo (ni confirmaciones ni boletos). Recarga créditos en Brevo.'
  }
  if (c.creditos != null && c.creditos < CREDITOS_MINIMOS) {
    return `Quedan ${c.creditos.toLocaleString('es-MX')} créditos de correo en Brevo y cada registro usa 2. Recarga antes de que se acaben.`
  }
  return null
}

function textoBienvenida(sesion: Sesion | null): string {
  if (sesion?.puedeOperar) {
    return 'Desde aquí operas todo el evento: puerta, mesa de atención, impresión de gafetes e informes, día por día.'
  }
  if (tiene(sesion, 'registrar') && tiene(sesion, 'buscar')) {
    return 'Registra a quien llega sin registro, atiende a los ya registrados (ficha, reenvío del boleto y etiqueta) y sigue lo que pasa cada día.'
  }
  return 'Consulta los números de cada día, la actividad de la mesa y el historial de accesos.'
}

export default function HubPage() {
  const sesion = useOutletContext<Sesion | null>()
  const verMesa = tiene(sesion, 'mesa')
  const verPuerta = tiene(sesion, 'escanear') || tiene(sesion, 'informes')
  const verMetricas = tiene(sesion, 'metricas')
  const verCorreo = verMesa || tiene(sesion, 'informes')
  const [data, setData] = useState<Resumen | null>(null)
  const [mesaHoy, setMesaHoy] = useState<MesaResp['hoy'] | null>(null)
  const [latency, setLatency] = useState<{
    p50: number | null
    p95: number | null
    n: number
    devices: { dispositivo: string; n: number; p50: number | null }[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [correo, setCorreo] = useState<EstadoCorreo | null>(null)
  const [loading, setLoading] = useState(true)
  const evento = data?.evento ?? sesion?.evento
  const [dia, setDia, diaParam] = useDiaSeleccionado(evento, { conTodos: true })

  useEffect(() => {
    let vivo = true
    setLoading(true)
    setMesaHoy(null)
    const cargar = () => {
      void api
        .resumen(diaParam)
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
      if (verCorreo) {
        void api
          .correoEstado()
          .then((e) => {
            if (vivo) setCorreo(e)
          })
          .catch(() => undefined)
      }
      if (verMesa) {
        void mesa
          .actividad(diaParam)
          .then((m) => {
            if (vivo) setMesaHoy(m.hoy)
          })
          .catch(() => undefined)
      }
      if (!verMetricas) return
      void api
        .metricas(diaParam)
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
  }, [verMesa, verMetricas, verCorreo, diaParam])

  // "Entradas · Día 2" / "Entradas · todo el evento"
  const sufijo = data?.dia ? (data.dia.modo === 'todos' ? 'evento' : data.dia.etiqueta.split(' · ')[0]) : '…'

  return (
    <main className={styles.page}>
      <p className={styles.lead}>
        Hola{sesion?.nombre ? `, ${sesion.nombre}` : ''}. {textoBienvenida(sesion)}
      </p>

      {error ? <div className={styles.alerta}>{error}</div> : null}
      {avisoCorreo(correo) ? (
        <div className={styles.alerta} role="alert">
          {avisoCorreo(correo)}
        </div>
      ) : null}

      {verPuerta || verMesa ? (
        <section className={styles.diasBloque} aria-label="Días del evento">
          <div className={styles.diasCab}>
            <h2>Días del evento</h2>
            <DiaSelector evento={evento} value={dia} onChange={setDia} compacto />
          </div>
          {data?.porDia?.length ? (
            <div className={styles.dias}>
              {data.porDia.map((d) => {
                const esHoy = data.evento.hoy === d.num
                const activo = dia === d.num
                return (
                  <button
                    key={d.num}
                    type="button"
                    className={`${styles.diaCard} ${activo ? styles.diaCardActivo : ''} ${esHoy ? styles.diaCardHoy : ''}`}
                    onClick={() => setDia(d.num)}
                    aria-pressed={activo}
                  >
                    <span className={styles.diaNum}>
                      {d.etiqueta}
                      {esHoy ? <em>HOY</em> : null}
                    </span>
                    <span className={styles.diaFecha}>{d.nombre}</span>
                    <strong>{d.unicos.toLocaleString('es-MX')}</strong>
                    <span className={styles.diaDetalle}>
                      personas · {d.entradas.toLocaleString('es-MX')} entradas
                      {verMesa ? ` · ${d.impresiones.toLocaleString('es-MX')} etiquetas` : ''}
                    </span>
                  </button>
                )
              })}
              {data.otrosDias ? (
                <div className={`${styles.diaCard} ${styles.diaCardOtros}`}>
                  <span className={styles.diaNum}>Fuera de fechas</span>
                  <span className={styles.diaFecha}>pruebas y previos</span>
                  <strong>{data.otrosDias.unicos.toLocaleString('es-MX')}</strong>
                  <span className={styles.diaDetalle}>
                    personas · {data.otrosDias.entradas.toLocaleString('es-MX')} entradas
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {latency ? (
        <section className={styles.kpis} aria-label="Latencia de escaneo">
          <Kpi label={`Escaneos medidos · ${sufijo}`} value={latency.n} loading={false} />
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
                <p>Altas, impresiones y reenvíos por usuario y por día.</p>
              </div>
            </Link>
          ) : null}
          {sesion?.puedeOperar ? (
            <Link className={styles.ahoraCard} to="/escanear">
              <span className={styles.ahoraNum}>▣</span>
              <div>
                <strong>Validar en puerta</strong>
                <p>Escanea QR: entrada, salida o reingreso. El estado se reinicia cada día.</p>
              </div>
            </Link>
          ) : null}
          {tiene(sesion, 'informes') ? (
            <Link className={styles.ahoraCard} to="/reportes">
              <span className={styles.ahoraNum}>↗</span>
              <div>
                <strong>Ver informes</strong>
                <p>Historial por día, filtros y Excel con una hoja por día y asistentes.</p>
              </div>
            </Link>
          ) : null}
          {verPuerta ? (
            <Link className={styles.ahoraCard} to="/zonas">
              <span className={styles.ahoraNum}>◫</span>
              <div>
                <strong>Zonas y aforo</strong>
                <p>Cuántas personas hay y caben en cada área hoy.</p>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      {verMesa ? (
        <section className={styles.kpis} aria-label={`Mesa de atención · ${sufijo}`}>
          <Kpi label={`Altas en sitio · ${sufijo}`} value={mesaHoy?.altas} loading={!mesaHoy} accent="navy" />
          <Kpi label={`Etiquetas impresas · ${sufijo}`} value={mesaHoy?.impresiones} loading={!mesaHoy} />
          <Kpi label={`Boletos reenviados · ${sufijo}`} value={mesaHoy?.reenvios} loading={!mesaHoy} />
          <Kpi label={`Reenvíos fallidos · ${sufijo}`} value={mesaHoy?.fallos} loading={!mesaHoy} accent="warn" />
        </section>
      ) : null}

      {verPuerta ? (
        <section className={styles.kpis} aria-label={`Puerta · ${sufijo}`}>
          <Kpi label="Personas dentro ahora" value={data?.dentro} loading={loading} accent="navy" />
          <Kpi label={`Personas distintas · ${sufijo}`} value={data?.unicosHoy} loading={loading} />
          <Kpi label={`Entradas · ${sufijo}`} value={data?.entradasHoy} loading={loading} />
          <Kpi label={`Salidas · ${sufijo}`} value={data?.salidasHoy} loading={loading} />
          <Kpi label={`Reingresos · ${sufijo}`} value={data?.reingresosHoy} loading={loading} />
          <Kpi label={`Rechazos · ${sufijo}`} value={data?.rechazosHoy} loading={loading} accent="warn" />
          <Kpi label="Confirmados (registro)" value={data?.confirmados} loading={loading} />
        </section>
      ) : null}

      {verPuerta ? (
      <section className={styles.tarjeta}>
        <div className={styles.tarjetaCab}>
          <h2>Actividad reciente</h2>
          <p>Últimos escaneos de la puerta — se actualiza sola cada 15 s.</p>
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
                <span className={styles.estado}>
                  {r.ok ? 'OK' : r.codigo === 'COOLDOWN' ? 'Duplicado' : 'Rechazado'}
                </span>
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
