import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { fechaHora, mesa, tiene, type MesaResp, type Sesion, type UsuarioEquipo } from '../api'
import styles from './mesa.module.scss'

const ACCIONES: Record<string, { texto: string; clase: string }> = {
  alta: { texto: 'Alta en sitio', clase: styles.accAlta },
  impresion: { texto: 'Etiqueta impresa', clase: styles.accImpresion },
  reenvio: { texto: 'Boleto reenviado', clase: styles.accReenvio },
  reenvio_fallido: { texto: 'Reenvío fallido', clase: styles.accFallo },
}
const VIAS: Record<string, string> = { ql: 'Brother QL-800', chrome: 'Chrome', pdf: 'PDF', test: 'Prueba' }

export default function MesaPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [data, setData] = useState<MesaResp | null>(null)
  const [equipo, setEquipo] = useState<UsuarioEquipo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const verEquipo = tiene(sesion, 'equipo')
  const puedeBuscar = tiene(sesion, 'buscar')

  useEffect(() => {
    let vivo = true
    const cargar = () => {
      void mesa
        .actividad()
        .then((d) => {
          if (!vivo) return
          setData(d)
          setError(null)
        })
        .catch((e: unknown) => {
          if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar la actividad')
        })
      if (verEquipo) {
        void mesa
          .equipo()
          .then((r) => {
            if (vivo) setEquipo(r.usuarios)
          })
          .catch(() => undefined)
      }
    }
    cargar()
    const t = window.setInterval(cargar, 20_000)
    return () => {
      vivo = false
      window.clearInterval(t)
    }
  }, [verEquipo])

  return (
    <main className={styles.page}>
      <p className={styles.lead}>
        Lo que hizo hoy cada usuario de la mesa: altas en sitio, etiquetas impresas y boletos reenviados
        por correo. Se actualiza cada 20 s.
      </p>

      {error ? <div className={styles.alerta}>{error}</div> : null}

      <section className={styles.kpis} aria-label="Totales de hoy">
        <Kpi label="Altas en sitio hoy" value={data?.hoy.altas} />
        <Kpi label="Etiquetas impresas hoy" value={data?.hoy.impresiones} />
        <Kpi label="Boletos reenviados hoy" value={data?.hoy.reenvios} />
        <Kpi label="Reenvíos fallidos hoy" value={data?.hoy.fallos} warn />
        <Kpi label="Altas en sitio (todo el evento)" value={data?.altasTotales} />
      </section>

      <section className={styles.tarjeta}>
        <h2>Por usuario · hoy</h2>
        {!data ? (
          <p className={styles.vacio}>Cargando…</p>
        ) : data.operadores.length ? (
          <div className={styles.tablaWrap}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Altas</th>
                  <th>Impresiones</th>
                  <th>Reenvíos</th>
                  <th>Fallidos</th>
                </tr>
              </thead>
              <tbody>
                {data.operadores.map((o) => (
                  <tr key={o.operador || '—'}>
                    <td>
                      <strong>{o.nombre || 'Sin usuario'}</strong>
                      {o.operador && o.operador !== o.nombre ? <span>{o.operador}</span> : null}
                    </td>
                    <td>{o.altas}</td>
                    <td>{o.impresiones}</td>
                    <td>{o.reenvios}</td>
                    <td className={o.fallos ? styles.mal : undefined}>{o.fallos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.vacio}>Nadie ha registrado actividad hoy.</p>
        )}
      </section>

      <section className={styles.tarjeta}>
        <h2>Últimos movimientos</h2>
        {!data ? (
          <p className={styles.vacio}>Cargando…</p>
        ) : data.recientes.length ? (
          <ul className={styles.lista}>
            {data.recientes.map((r, i) => {
              const acc = ACCIONES[r.accion] ?? { texto: r.accion, clase: '' }
              const detalle = r.accion === 'impresion' ? VIAS[r.detalle] ?? r.detalle : r.detalle
              return (
                <li key={`${r.accion}-${r.tipo}-${r.registroId}-${r.creado}-${i}`}>
                  <time>{fechaHora(r.creado)}</time>
                  <span className={`${styles.acc} ${acc.clase}`}>{acc.texto}</span>
                  <span className={styles.quien}>
                    {puedeBuscar ? (
                      <Link to={`/buscar?q=${encodeURIComponent(r.folio)}`}>{r.nombre || r.folio}</Link>
                    ) : (
                      <b>{r.nombre || r.folio}</b>
                    )}
                    <small>
                      {r.folio}
                      {detalle ? ` · ${detalle}` : ''} · {r.operadorNombre || 'Sin usuario'}
                    </small>
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className={styles.vacio}>Aún no hay movimientos de la mesa.</p>
        )}
      </section>

      {verEquipo && equipo ? (
        <section className={styles.tarjeta}>
          <h2>Usuarios del panel</h2>
          <div className={styles.tablaWrap}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Último acceso</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {equipo.map((u) => (
                  <tr key={u.usuario} className={u.activo ? undefined : styles.inactivo}>
                    <td>
                      <strong>{u.nombre}</strong>
                      <span>{u.usuario}</span>
                    </td>
                    <td>{u.rolNombre}</td>
                    <td>{fechaHora(u.ultimoAcceso) ?? 'Nunca'}</td>
                    <td>{u.activo ? 'Activo' : 'Desactivado'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  )
}

function Kpi({ label, value, warn }: { label: string; value?: number; warn?: boolean }) {
  return (
    <article className={`${styles.kpi} ${warn && value ? styles.kpiWarn : ''}`}>
      <span>{label}</span>
      <strong>{value == null ? '…' : value.toLocaleString('es-MX')}</strong>
    </article>
  )
}
