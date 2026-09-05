import { useCallback, useEffect, useState } from 'react'
import { api, type Escaneo } from '../api'
import styles from './reportes.module.scss'

export default function ReportesPage() {
  const [modo, setModo] = useState('')
  const [ok, setOk] = useState('')
  const [q, setQ] = useState('')
  const [kpis, setKpis] = useState({ total: 0, entradas: 0, salidas: 0, rechazos: 0 })
  const [rows, setRows] = useState<Escaneo[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const p = new URLSearchParams()
    if (modo) p.set('modo', modo)
    if (ok) p.set('ok', ok)
    if (q.trim()) p.set('q', q.trim())
    p.set('limite', '300')
    try {
      const data = await api.reportes(p)
      setKpis(data.kpis)
      setRows(data.registros)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    }
  }, [modo, ok, q])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 180)
    return () => window.clearTimeout(t)
  }, [load])

  const descargar = (formato: 'csv' | 'xlsx') => {
    const p = new URLSearchParams()
    if (modo) p.set('modo', modo)
    if (ok) p.set('ok', ok)
    if (q.trim()) p.set('q', q.trim())
    p.set('formato', formato)
    p.set('limite', '2000')
    window.location.href = `/api/accesos/reportes?${p}`
  }

  return (
    <main className={styles.page}>
      <p className={styles.kicker}>Informes</p>
      <h1>Accesos y reingresos</h1>
      <div className={styles.kpis}>
        <span>Total {kpis.total}</span>
        <span>Entradas {kpis.entradas}</span>
        <span>Salidas {kpis.salidas}</span>
        <span>Rechazos {kpis.rechazos}</span>
      </div>
      <div className={styles.filtros}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o folio…" />
        <select value={modo} onChange={(e) => setModo(e.target.value)}>
          <option value="">Entrada y salida</option>
          <option value="entrada">Entrada</option>
          <option value="salida">Salida</option>
        </select>
        <select value={ok} onChange={(e) => setOk(e.target.value)}>
          <option value="">Todos</option>
          <option value="true">Aceptados</option>
          <option value="false">Rechazados</option>
        </select>
        <button type="button" onClick={() => descargar('csv')}>
          CSV
        </button>
        <button type="button" onClick={() => descargar('xlsx')}>
          Excel
        </button>
      </div>
      {error ? <p className={styles.err}>{error}</p> : null}
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Nombre</th>
            <th>Modo</th>
            <th>Zona</th>
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.creado).toLocaleString('es-MX')}</td>
              <td>{r.nombre}</td>
              <td>{r.modo}</td>
              <td>{r.zona_clave || '—'}</td>
              <td className={r.ok ? styles.ok : styles.mal}>{r.mensaje}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
