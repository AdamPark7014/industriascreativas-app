import { digitsOnly, toUpperCaseInput } from '../utils/forms'
import styles from '../styles/elisa.module.scss'

export default function EventoElisaPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h2>Formulario de registro</h2>
          <p>Regístrate de forma rápida y segura</p>
        </div>

        <form action="/registro_eventlisa" method="POST">
          <div className={styles.group}>
            <label className={styles.label} htmlFor="nombre">
              Nombre completo
            </label>
            <input
              className={styles.input}
              type="text"
              id="nombre"
              name="nombre"
              placeholder="Ej. Juan Pérez"
              required
              minLength={3}
              pattern="[a-zA-ZáéíóúÁÉÍÓÚñÑ ]+"
              style={{ textTransform: 'uppercase' }}
              onInput={toUpperCaseInput}
            />
            <span className={styles.error}>
              Por favor, introduce un nombre válido (mínimo 3 letras).
            </span>
          </div>

          <div className={styles.group}>
            <label className={styles.label} htmlFor="email">
              Correo electrónico
            </label>
            <input
              className={styles.input}
              type="email"
              id="email"
              name="email"
              placeholder="ejemplo@correo.com"
              required
            />
            <span className={styles.error}>
              Introduce una dirección de correo electrónico válida.
            </span>
          </div>

          <div className={styles.group}>
            <label className={styles.label} htmlFor="telefono">
              Teléfono celular
            </label>
            <input
              className={styles.input}
              type="tel"
              id="telefono"
              name="telefono"
              placeholder="Ej. 2221234567"
              required
              pattern="[0-9]{10}"
              maxLength={10}
              onInput={(e) => digitsOnly(e, 10)}
            />
            <span className={styles.error}>
              Introduce un número de teléfono válido a 10 dígitos.
            </span>
          </div>

          <div className={styles.group}>
            <label className={styles.label} htmlFor="cp">
              Código Postal
            </label>
            <input
              className={styles.input}
              type="text"
              id="cp"
              name="cp"
              placeholder="Ej. 72000"
              required
              pattern="[0-9]{5}"
              maxLength={5}
              onInput={(e) => digitsOnly(e, 5)}
            />
            <span className={styles.error}>
              Introduce un Código Postal válido (5 dígitos).
            </span>
          </div>

          <button type="submit" id="registrarse" className={styles.submit}>
            Registrarse
          </button>
        </form>
      </div>
    </div>
  )
}
