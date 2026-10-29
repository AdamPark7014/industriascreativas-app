import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { BASE_API, api, fmtHora, type EscaneoFila, type Sesion } from '../api'
import styles from './hub.module.scss'
import t from './tablas.module.scss'

type Resultado = 'todos' | 'ok' | 'rechazo'

export default function HistorialPage() {
  const sesion = useOutletContext<Sesion | null>()
  const hoy = sesion?.jornada.fecha ?? ''
  const [jornada, setJornada] = useState<string>('')
  const [operador, setOperador] = useState('')
  const [resultado, setResultado] = useState<Resultado>('todos')
  const [pase, setPase] = useState('')
  const [filas, setFilas] = useState<EscaneoFila[] | null>(null)
  const [jornadas, setJornadas] = useState<{ jornada: string; nombre: string; escaneos: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const fecha = jornada || hoy

  useEffect(() => {
    void api
      .resumen()
      .then((r) => setJornadas(r.jornadas))
      .catch(() => undefined)
  }, [])

  const params = useMemo(() => {
    const q = new URLSearchParams({ jornada: fecha || 'todas' })
    if (operador) q.set('operador', operador)
    if (resultado !== 'todos') q.set('resultado', resultado)
    if (pase.trim()) q.set('pase', pase.trim())
    return q
  }, [fecha, operador, resultado, pase])

  useEffect(() => {
    let vivo = true
    setFilas(null)
    const id = window.setTimeout(() => {
      void api
        .escaneos(params)
        .then((d) => vivo && (setFilas(d.escaneos), setError(null)))
        .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar'))
    }, 250)
    return () => {
      vivo = false
      window.clearTimeout(id)
    }
  }, [params])

  const operadores = useMemo(
    () => Array.from(new Set((filas ?? []).map((f) => f.operador).filter(Boolean) as string[])).sort(),
    [filas],
  )
  const csv = `${BASE_API}/escaneos?${new URLSearchParams({ ...Object.fromEntries(params), formato: 'csv' })}`
  const opciones = hoy && !jornadas.some((j) => j.jornada === hoy) ? [{ jornada: hoy, nombre: sesion?.jornada.nombre ?? hoy, escaneos: 0 }, ...jornadas] : jornadas

  return (
    <main className={styles.page}>
      <p className={styles.lead}>Cada lectura de las PDA, con hora, usuario y resultado. Pantalla: últimas 400; el CSV trae todo.</p>

      <div className={t.barraFiltros}>
        <label className={t.filtro}>
          <span>Jornada</span>
          <select value={fecha} onChange={(e) => setJornada(e.target.value)}>
            {opciones.map((j) => (
              <option key={j.jornada} value={j.jornada}>
                {j.nombre}
                {j.jornada === hoy ? ' (hoy)' : ''}
              </option>
            ))}
            <option value="todas">Todas las jornadas</option>
          </select>
        </label>
        <label className={t.filtro}>
          <span>Usuario</span>
          <select value={operador} onChange={(e) => setOperador(e.target.value)}>
            <option value="">Todos</option>
            {(operador && !operadores.includes(operador) ? [operador, ...operadores] : operadores).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className={t.filtro}>
          <span>Resultado</span>
          <select value={resultado} onChange={(e) => setResultado(e.target.value as Resultado)}>
            <option value="todos">Todos</option>
            <option value="ok">Aceptados</option>
            <option value="rechazo">Rechazados</option>
          </select>
        </label>
        <label className={t.filtro}>
          <span>Pase</span>
          <input value={pase} onChange={(e) => setPase(e.target.value)} placeholder="45" inputMode="numeric" />
        </label>
        <a className={t.botonPrimario} href={csv}>
          Descargar CSV
        </a>
      </div>

      {error ? <div className={t.aviso}>{error}</div> : null}

      <section className={styles.tarjeta}>
        {!filas ? (
          <p className={styles.vacio}>Cargando…</p>
        ) : !filas.length ? (
          <p className={styles.vacio}>Sin lecturas con esos filtros.</p>
        ) : (
          <div className={t.scroll}>
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th>Hora</th>
                  {fecha === 'todas' ? <th>Jornada</th> : null}
                  <th>Pase</th>
                  <th>Movimiento</th>
                  <th>Resultado</th>
                  <th>Usuario</th>
                  <th>Estación</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td>{fmtHora(f.creado, true)}</td>
                    {fecha === 'todas' ? <td>{f.jornada}</td> : null}
                    <td>
                      {f.pase ? <b>{f.pase}</b> : <small>«{f.leido.slice(0, 24)}»</small>}
                      {f.titular ? <small> · {f.titular}</small> : null}
                    </td>
                    <td>{f.modo === 'entrada' ? (f.reingreso ? 'Reingreso' : 'Entrada') : 'Salida'}</td>
                    <td>
                      <span className={`${t.badge} ${f.ok ? t.badgeOk : f.codigo === 'COOLDOWN' ? '' : t.badgeMal}`}>
                        {f.ok ? 'Aceptado' : f.mensaje}
                      </span>
                      {f.origen === 'offline' ? <small> · sin red</small> : null}
                    </td>
                    <td>{f.operador || '—'}</td>
                    <td>{f.dispositivo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
