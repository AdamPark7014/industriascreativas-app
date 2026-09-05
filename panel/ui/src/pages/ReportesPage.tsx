import { useCallback, useEffect, useState } from 'react'
import { api, type Escaneo } from '../api'
import styles from './reportes.module.scss'

export default function ReportesPage() {
  const [modo, setModo] = useState('')
  const [ok, setOk] = useState('')
  const [zona, setZona] = useState('')
  const [q, setQ] = useState('')
  const [kpis, setKpis] = useState({
    total: 0,
    entradas: 0,
    salidas: 0,
    rechazos: 0,
    reingresos: 0,
  })
  const [zonas, setZonas] = useState<{ clave: string; nombre: string }[]>([])
  const [rows, setRows] = useState<Escaneo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(true)

  const load = useCallback(async (signal?: AbortSignal) => {
    const p = new URLSearchParams()
    if (modo) p.set('modo', modo)
    if (ok) p.set('ok', ok)
    if (zona) p.set('zona', zona)
    if (q.trim()) p.set('q', q.trim())
    p.set('limite', '300')
    setLoading(true)
    try {
      const data = await api.reportes(p, signal)
      if (signal?.aborted) return
      setKpis({
        total: data.kpis.total ?? 0,
        entradas: data.kpis.entradas ?? 0,
        salidas: data.kpis.salidas ?? 0,
        rechazos: data.kpis.rechazos ?? 0,
        reingresos: data.kpis.reingresos ?? 0,
      })
      setRows(data.registros)
      if (data.zonas?.length) setZonas(data.zonas)
      setError(null)
    } catch (e) {
      if (signal?.aborted) return
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los informes')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [modo, ok, zona, q])

  useEffect(() => {
    const ac = new AbortController()
    const t = window.setTimeout(() => void load(ac.signal), 180)
    return () => {
      ac.abort()
      window.clearTimeout(t)
    }
  }, [load])

  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => void load(), 12000)
    return () => window.clearInterval(id)
  }, [live, load])

  const descargar = (formato: 'csv' | 'xlsx') => {
    const p = new URLSearchParams()
    if (modo) p.set('modo', modo)
    if (ok) p.set('ok', ok)
    if (zona) p.set('zona', zona)
    if (q.trim()) p.set('q', q.trim())
    p.set('formato', formato)
    p.set('limite', '2000')
    window.location.href = `/api/accesos/reportes?${p}`
  }

  return (
    <main className={styles.page}>
      <p className={styles.lead}>
        Revisa quién entró o salió. Filtra por zona, movimiento o resultado,
        y descarga CSV o Excel. Reingresos = entradas OK tras una salida previa.
      </p>

      <section className={styles.kpis} aria-label="Totales filtrados">
        <article>
          <span>Total</span>
          <strong>{kpis.total.toLocaleString('es-MX')}</strong>
        </article>
        <article>
          <span>Entradas</span>
          <strong>{kpis.entradas.toLocaleString('es-MX')}</strong>
        </article>
        <article>
          <span>Salidas</span>
          <strong>{kpis.salidas.toLocaleString('es-MX')}</strong>
        </article>
        <article>
          <span>Reingresos</span>
          <strong>{kpis.reingresos.toLocaleString('es-MX')}</strong>
        </article>
        <article>
          <span>Rechazos</span>
          <strong className={styles.warn}>{kpis.rechazos.toLocaleString('es-MX')}</strong>
        </article>
      </section>

      <div className={styles.filtros}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar por nombre o folio…"
        />
        <select value={modo} onChange={(e) => setModo(e.target.value)}>
          <option value="">Entrada y salida</option>
          <option value="entrada">Solo entradas</option>
          <option value="salida">Solo salidas</option>
        </select>
        <select value={ok} onChange={(e) => setOk(e.target.value)}>
          <option value="">Aceptados y rechazados</option>
          <option value="true">Solo aceptados</option>
          <option value="false">Solo rechazados</option>
        </select>
        <select value={zona} onChange={(e) => setZona(e.target.value)} aria-label="Zona">
          <option value="">Todas las zonas</option>
          {zonas.map((z) => (
            <option key={z.clave} value={z.clave}>
              {z.nombre}
            </option>
          ))}
        </select>
        <label className={styles.live}>
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => setLive(e.target.checked)}
          />
          En vivo
        </label>
        <button type="button" className={styles.secundario} onClick={() => descargar('csv')}>
          Exportar CSV
        </button>
        <button type="button" className={styles.primario} onClick={() => descargar('xlsx')}>
          Exportar Excel
        </button>
      </div>

      {error ? <div className={styles.alerta}>{error}</div> : null}

      <div className={styles.tablaWrap}>
        {loading ? <p className={styles.vacio}>Cargando informes…</p> : null}
        {!loading && !rows.length ? (
          <p className={styles.vacio}>
            No hay movimientos con estos filtros. Prueba quitar el filtro o ampliar la búsqueda.
          </p>
        ) : null}
        {!loading && rows.length ? (
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Nombre</th>
                <th>Movimiento</th>
                <th>Zona</th>
                <th>Resultado</th>
                <th>Desde</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {new Date(r.creado).toLocaleString('es-MX', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className={styles.nombre}>{r.nombre || '—'}</td>
                  <td>
                    <span className={styles.chip}>
                      {r.modo === 'entrada' ? 'Entrada' : r.modo === 'salida' ? 'Salida' : r.modo}
                    </span>
                  </td>
                  <td>{r.zona_clave || '—'}</td>
                  <td className={r.ok ? styles.ok : styles.mal}>{r.mensaje}</td>
                  <td>{r.origen || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </main>
  )
}
