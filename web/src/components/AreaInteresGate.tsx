import { useEffect, useRef, useState } from 'react'
import { AREAS_EXPLORAR } from '../constants/registro'
import { guardarAreaInteres, leerAreaInteres } from '../lib/areaInteres'
import styles from '../styles/flow.module.scss'

/**
 * Pop-up de portada que bloquea la interacción hasta que se elige un área.
 *
 * Bloquea de verdad, no en apariencia: overlay sobre todo el contenido, foco
 * atrapado dentro del diálogo y `Escape` desactivado. El cliente pidió que
 * nadie pueda navegar sin responder, y un modal que se cierra con Escape o con
 * clic afuera no cumple eso.
 *
 * No se renderiza nada hasta saber si ya hay respuesta guardada: pintar el
 * modal y esconderlo un instante después produce un parpadeo en cada visita de
 * quien ya contestó.
 */
export default function AreaInteresGate() {
  const [abierto, setAbierto] = useState(false)
  const [seleccion, setSeleccion] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!leerAreaInteres()) setAbierto(true)
  }, [])

  useEffect(() => {
    if (!abierto) return

    // Sin scroll de fondo: en móvil el modal es alto y el fondo se arrastra.
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Foco atrapado: Tab no debe salir del diálogo mientras esté abierto, y
    // Escape no lo cierra porque la respuesta es obligatoria.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        return
      }
      if (event.key !== 'Tab') return
      const nodo = dialogRef.current
      if (!nodo) return
      const focusables = nodo.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const primero = focusables[0]
      const ultimo = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === primero) {
        event.preventDefault()
        ultimo.focus()
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault()
        primero.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    dialogRef.current?.querySelector<HTMLElement>('input')?.focus()

    return () => {
      document.body.style.overflow = overflowPrevio
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [abierto])

  if (!abierto) return null

  function confirmar() {
    if (!seleccion) return
    guardarAreaInteres(seleccion)
    setAbierto(false)
  }

  return (
    <div className={styles.gateOverlay}>
      <div
        className={styles.gateDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        ref={dialogRef}
      >
        <span className={styles.gateGlow} aria-hidden />

        <h2 className={styles.gateTitle} id="gate-title">
          ¿Qué área de interés te gustaría explorar?
          <span className={styles.gateTitleHint}>(Selecciona una opción)</span>
        </h2>

        <div className={styles.gateOptions}>
          {AREAS_EXPLORAR.map((area) => (
            <label
              className={`${styles.gateOption} ${seleccion === area ? styles.gateOptionOn : ''}`}
              key={area}
            >
              <input
                type="radio"
                name="area-explorar"
                value={area}
                checked={seleccion === area}
                onChange={() => setSeleccion(area)}
              />
              <span>{area}</span>
            </label>
          ))}
        </div>

        <button
          className={styles.gateSubmit}
          type="button"
          onClick={confirmar}
          disabled={!seleccion}
        >
          Continuar
        </button>
      </div>
    </div>
  )
}
