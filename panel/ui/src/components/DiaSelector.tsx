import type { EventoInfo } from '../api'
import type { DiaSel } from '../lib/useDia'
import styles from './dia-selector.module.scss'

type Props = {
  evento?: EventoInfo | null
  value: DiaSel
  onChange: (d: DiaSel) => void
  /** Muestra la opción "Todo el evento". */
  conTodos?: boolean
  /** Sin la fecha debajo de cada día (barras estrechas). */
  compacto?: boolean
  'aria-label'?: string
}

/** Pestañas Día 1 · Día 2 · Día 3 (· Todo el evento) con la marca HOY. */
export default function DiaSelector({
  evento,
  value,
  onChange,
  conTodos = true,
  compacto = false,
  'aria-label': ariaLabel = 'Día del evento',
}: Props) {
  if (!evento) {
    return (
      <div className={styles.grupo} role="group" aria-label={ariaLabel} aria-busy>
        {[0, 1, 2].map((i) => (
          <span key={i} className={styles.esqueleto} />
        ))}
      </div>
    )
  }
  return (
    <div className={`${styles.grupo} ${compacto ? styles.compacto : ''}`} role="group" aria-label={ariaLabel}>
      {evento.dias.map((d) => {
        const hoy = evento.hoy === d.num
        const activo = value === d.num
        return (
          <button
            key={d.num}
            type="button"
            className={`${styles.dia} ${activo ? styles.activo : ''} ${hoy ? styles.hoy : ''}`}
            aria-pressed={activo}
            onClick={() => onChange(d.num)}
            title={`${d.etiqueta} · ${d.nombre}${hoy ? ' · hoy' : ''}`}
          >
            <strong>
              {d.etiqueta}
              {hoy ? <em>HOY</em> : null}
            </strong>
            {compacto ? null : <span>{d.nombre}</span>}
          </button>
        )
      })}
      {conTodos ? (
        <button
          type="button"
          className={`${styles.dia} ${styles.todos} ${value === 'todos' ? styles.activo : ''}`}
          aria-pressed={value === 'todos'}
          onClick={() => onChange('todos')}
        >
          <strong>Todo el evento</strong>
          {compacto ? null : <span>{evento.dias.length} días</span>}
        </button>
      ) : null}
      {!evento.hoy ? (
        <span className={styles.aviso} role="status">
          Hoy ({evento.fechaHoy}) no es día del evento
        </span>
      ) : null}
    </div>
  )
}
