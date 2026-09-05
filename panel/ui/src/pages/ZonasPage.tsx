import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { api, type Sesion, type Zona } from '../api'
import styles from './zonas.module.scss'

export default function ZonasPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [zonas, setZonas] = useState<Zona[]>([])
  const [nombre, setNombre] = useState('')
  const [clave, setClave] = useState('')
  const [aforo, setAforo] = useState('200')
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    api
      .zonas()
      .then((d) => setZonas(d.zonas))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error'))

  useEffect(() => {
    void load()
  }, [])

  const guardar = async () => {
    if (!sesion?.puedeOperar) return
    try {
      const data = await api.guardarZona({
        clave,
        nombre,
        aforo: Number(aforo) || 0,
      })
      setZonas(data.zonas)
      setNombre('')
      setClave('')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se guardó')
    }
  }

  return (
    <main className={styles.page}>
      <p className={styles.kicker}>Aforo</p>
      <h1>Zonas de acceso</h1>
      <p className={styles.sub}>
        ENTRADA se niega si la zona está llena. SALIDA libera un lugar y permite reingreso.
      </p>
      {error ? <p className={styles.err}>{error}</p> : null}
      <ul className={styles.lista}>
        {zonas.map((z) => {
          const pct = z.aforo > 0 ? Math.min(100, Math.round((z.dentro / z.aforo) * 100)) : 0
          return (
            <li key={z.clave}>
              <div>
                <strong>{z.nombre}</strong>
                <span>
                  {z.dentro} dentro · aforo {z.aforo || 'sin tope'}
                </span>
              </div>
              <div className={styles.bar}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      {sesion?.puedeOperar ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault()
            void guardar()
          }}
        >
          <h2>Alta / ajuste</h2>
          <input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="clave (vip)" />
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" />
          <input
            value={aforo}
            onChange={(e) => setAforo(e.target.value)}
            placeholder="Aforo"
            type="number"
            min={0}
          />
          <button type="submit">Guardar</button>
        </form>
      ) : (
        <p className={styles.sub}>Solo internos pueden cambiar aforos.</p>
      )}
    </main>
  )
}
