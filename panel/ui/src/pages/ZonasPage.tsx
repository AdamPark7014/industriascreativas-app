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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    return api
      .zonas()
      .then((d) => {
        setZonas(d.zonas)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error al cargar zonas'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
  }, [])

  const guardar = async () => {
    if (!sesion?.puedeOperar) return
    setOkMsg(null)
    try {
      const data = await api.guardarZona({
        clave: clave.trim().toLowerCase(),
        nombre: nombre.trim(),
        aforo: Number(aforo) || 0,
      })
      setZonas(data.zonas)
      setNombre('')
      setClave('')
      setAforo('200')
      setError(null)
      setOkMsg('Zona guardada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  return (
    <main className={styles.page}>
      <p className={styles.lead}>
        Cada escaneo de entrada suma aforo; la salida lo libera. Si la zona está
        llena, la entrada se rechaza hasta que haya salidas.
      </p>

      {error ? <div className={styles.alerta}>{error}</div> : null}
      {okMsg ? <div className={styles.ok}>{okMsg}</div> : null}

      {loading && !zonas.length ? <p className={styles.vacio}>Cargando zonas…</p> : null}

      <ul className={styles.lista}>
        {zonas.map((z) => {
          const pct = z.aforo > 0 ? Math.min(100, Math.round((z.dentro / z.aforo) * 100)) : 0
          const llena = z.aforo > 0 && z.dentro >= z.aforo
          return (
            <li key={z.clave}>
              <div className={styles.cab}>
                <div>
                  <strong>{z.nombre}</strong>
                  <span className={styles.clave}>{z.clave}</span>
                </div>
                <div className={styles.nums}>
                  <b>{z.dentro}</b>
                  <span>/ {z.aforo > 0 ? z.aforo : '∞'}</span>
                  {llena ? <em>Llena</em> : null}
                </div>
              </div>
              <div className={styles.bar} aria-hidden>
                <i style={{ width: `${z.aforo > 0 ? pct : 0}%` }} className={llena ? styles.lleno : undefined} />
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
          <h2>Alta o ajuste de zona</h2>
          <div className={styles.grid}>
            <label>
              Clave
              <input
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="vip"
                required
                pattern="[a-z0-9_-]+"
              />
            </label>
            <label>
              Nombre visible
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="VIP"
                required
              />
            </label>
            <label>
              Aforo (0 = sin tope)
              <input
                value={aforo}
                onChange={(e) => setAforo(e.target.value)}
                type="number"
                min={0}
              />
            </label>
          </div>
          <button type="submit">Guardar zona</button>
        </form>
      ) : (
        <p className={styles.nota}>Tu rol de promotor puede consultar aforo, no modificarlo.</p>
      )}
    </main>
  )
}
