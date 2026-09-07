/**
 * Respuesta al pop-up de portada («¿Qué área de interés te gustaría explorar?»).
 *
 * Se guarda en cuanto se contesta, no al enviar el formulario: el cliente quiere
 * segmentar a todo el que entra al sitio, y la mayoría de las visitas no llegan
 * a registrarse. Después viaja con los dos formularios para que el dato quede
 * pegado al registro y no solo en un contador anónimo.
 *
 * `localStorage` y no `sessionStorage` porque el flujo real es: entro desde el
 * teléfono, contesto, me distraigo y vuelvo más tarde. Volver a preguntar en
 * cada visita molesta y ensucia el dato con respuestas repetidas.
 */
const STORAGE_KEY = 'ficti:area-interes'

/** Lee la respuesta guardada. `null` si no hay o si el navegador la bloquea. */
export function leerAreaInteres(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value && value.trim() ? value : null
  } catch {
    // Safari en privado y navegadores con almacenamiento bloqueado lanzan aquí.
    // Sin dato guardado se vuelve a preguntar, que es el peor caso aceptable.
    return null
  }
}

/** Guarda la respuesta. Silencioso si el navegador no deja escribir. */
export function guardarAreaInteres(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* sin persistencia: la sesión actual sigue funcionando igual */
  }
}
