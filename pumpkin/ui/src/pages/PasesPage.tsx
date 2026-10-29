import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api, fmtHora, tiene, type EstadoPase, type Pase, type Sesion } from '../api'
import styles from './hub.module.scss'
import t from './tablas.module.scss'

type Filtro = 'todos' | EstadoPase | 'bloqueados'

const ETIQUETA: Record<EstadoPase, string> = {
  dentro: 'Dentro',
  salio: 'Salió',
  sin_entrar: 'Sin entrar',
}

export default function PasesPage() {
  const sesion = useOutletContext<Sesion | null>()
  const puedeEditar = tiene(sesion, 'bloquear')
  const [pases, setPases] = useState<Pase[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(
    () =>
      api
        .pases()
        .then((d) => {
          setPases(d.pases)
          setError(null)
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar')),
    [],
  )

  useEffect(() => {
    void cargar()
    const id = window.setInterval(() => void cargar(), 15_000)
    return () => window.clearInterval(id)
  }, [cargar])

  const cuenta = useMemo(() => {
    const c = { todos: 0, dentro: 0, salio: 0, sin_entrar: 0, bloqueados: 0 }
    for (const p of pases ?? []) {
      c.todos += 1
      c[p.estado] += 1
      if (p.bloqueado) c.bloqueados += 1
    }
    return c
  }, [pases])

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase()
    const num = /^\d{1,3}$/.test(texto) ? Number(texto) : null
    return (pases ?? []).filter((p) => {
      if (filtro === 'bloqueados' ? !p.bloqueado : filtro !== 'todos' && p.estado !== filtro) return false
      if (!texto) return true
      if (num != null) return p.numero === num
      return p.codigo.toLowerCase().includes(texto) || p.titular.toLowerCase().includes(texto)
    })
  }, [pases, q, filtro])

  const guardar = async (p: Pase, cambios: Parameters<typeof api.actualizarPase>[1]) => {
    setGuardando(p.codigo)
    try {
      await api.actualizarPase(p.codigo, cambios)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(null)
    }
  }

  const alternarBloqueo = (p: Pase) => {
    if (p.bloqueado) {
      if (window.confirm(`¿Desbloquear ${p.codigo}? Podrá volver a entrar.`)) void guardar(p, { bloqueado: false })
      return
    }
    const motivo = window.prompt(`Motivo para bloquear ${p.codigo} (lo verá la puerta):`, 'Pase reportado como perdido')
    if (motivo != null) void guardar(p, { bloqueado: true, motivo })
  }

  const FILTROS: [Filtro, string][] = [
    ['todos', 'Todos'],
    ['dentro', 'Dentro'],
    ['salio', 'Salieron'],
    ['sin_entrar', 'Sin entrar'],
    ['bloqueados', 'Bloqueados'],
  ]

  return (
    <main className={styles.page}>
      <p className={styles.lead}>
        Los 250 pases del lote (QR-001 a QR-250) y su estado en la jornada{' '}
        {sesion?.jornada ? <b>{sesion.jornada.nombre}</b> : null}. Escribe un número (45) o un nombre para buscar.
      </p>

      <div className={t.barraFiltros}>
        <input
          className={t.buscar}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar: 45, QR-045 o titular"
          aria-label="Buscar pase"
        />
        <div className={t.chips} role="group" aria-label="Estado">
          {FILTROS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`${t.chip} ${filtro === k ? t.chipOn : ''}`}
              onClick={() => setFiltro(k)}
            >
              {label} <b>{cuenta[k]}</b>
            </button>
          ))}
        </div>
      </div>

      {error ? <div className={t.aviso}>{error}</div> : null}

      <section className={styles.tarjeta}>
        {!pases ? (
          <p className={styles.vacio}>Cargando pases…</p>
        ) : !visibles.length ? (
          <p className={styles.vacio}>Ningún pase coincide.</p>
        ) : (
          <div className={t.scroll}>
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th>Pase</th>
                  <th>Titular</th>
                  <th>Estado</th>
                  <th>Entradas hoy</th>
                  <th>Total</th>
                  <th>Último movimiento</th>
                  {puedeEditar ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.codigo} className={p.bloqueado ? t.filaBloqueada : ''}>
                    <td>
                      <b>{p.codigo}</b>
                      <small> · hoja {p.hoja}</small>
                    </td>
                    <td>
                      {puedeEditar ? (
                        <input
                          className={t.editable}
                          defaultValue={p.titular}
                          placeholder="Sin asignar"
                          aria-label={`Titular de ${p.codigo}`}
                          disabled={guardando === p.codigo}
                          onBlur={(e) => {
                            const v = e.target.value.trim()
                            if (v !== p.titular) void guardar(p, { titular: v })
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                          }}
                        />
                      ) : (
                        p.titular || '—'
                      )}
                    </td>
                    <td>
                      {p.bloqueado ? (
                        <span className={`${t.badge} ${t.badgeMal}`} title={p.motivo}>
                          Bloqueado
                        </span>
                      ) : (
                        <span className={`${t.badge} ${t[`badge_${p.estado}`]}`}>{ETIQUETA[p.estado]}</span>
                      )}
                    </td>
                    <td>{p.entradasHoy}</td>
                    <td>{p.entradasTotal}</td>
                    <td>
                      {p.ultimoAt ? (
                        <>
                          {fmtHora(p.ultimoAt)}
                          {p.ultimoOperador ? <small> · {p.ultimoOperador}</small> : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    {puedeEditar ? (
                      <td>
                        <button
                          type="button"
                          className={t.botonChico}
                          disabled={guardando === p.codigo}
                          onClick={() => alternarBloqueo(p)}
                        >
                          {p.bloqueado ? 'Desbloquear' : 'Bloquear'}
                        </button>
                      </td>
                    ) : null}
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
