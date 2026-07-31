import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { postForm } from '../api/registro'
import AppShell from '../components/AppShell'
import BadgePreview from '../components/BadgePreview'
import PhoneField from '../components/PhoneField'
import { RegistrationSuccess } from '../components/RegistrationSuccess'
import {
  emptyEstudianteForm,
  LEYENDA_CANJE,
  type EstudianteFormData,
} from '../constants/registro'
import { findDial, formatPhoneDisplay, validateLocalPhone } from '../constants/phone'
import { toUpperCaseInput } from '../utils/forms'
import styles from '../styles/flow.module.scss'

type Step = 'form' | 'review' | 'done'

export default function EstudiantesPage() {
  const [step, setStep] = useState<Step>('form')
  const [form, setForm] = useState<EstudianteFormData>(emptyEstudianteForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const nombreCompleto = useMemo(
    () => `${form.nombre} ${form.apellidoPaterno}`.trim().toUpperCase(),
    [form.nombre, form.apellidoPaterno],
  )

  const phoneDisplay = useMemo(
    () => formatPhoneDisplay(findDial(form.phoneCountry).dial, form.telefono),
    [form.phoneCountry, form.telefono],
  )

  function update<K extends keyof EstudianteFormData>(key: K, value: EstudianteFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function validateForm() {
    if (!form.email) return 'El correo es obligatorio.'
    if (!form.nombre || !form.apellidoPaterno) return 'Nombre y apellido son obligatorios.'
    return validateLocalPhone(form.phoneCountry, form.telefono)
  }

  function goReview(event: FormEvent) {
    event.preventDefault()
    const message = validateForm()
    if (message) {
      setError(message)
      return
    }
    setError('')
    setStep('review')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitRegistro() {
    setLoading(true)
    setError('')
    const result = await postForm('/registro_alumno', {
      email: form.email.trim().toLowerCase(),
      nombre: form.nombre.trim().toUpperCase(),
      apellido_paterno: form.apellidoPaterno.trim().toUpperCase(),
      lada_pais: findDial(form.phoneCountry).dial,
      telefono: form.telefono.trim(),
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setStep('done')
  }

  if (step === 'done') {
    return (
      <AppShell>
        <RegistrationSuccess title="Registro de estudiante enviado">
          <div className={styles.actions} style={{ justifyContent: 'center', border: 'none', background: 'transparent' }}>
            <Link className={styles.btnGhost} to="/">
              Volver al menú
            </Link>
          </div>
        </RegistrationSuccess>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className={styles.shell}>
        <div className={styles.hero}>
          <p className={styles.kicker}>Acreditación estudiantil</p>
          <h1 className={styles.title}>Registro Estudiante</h1>
          <p className={styles.subtitle}>
            Solo pedimos los datos esenciales. Después verás el resumen y la vista previa de tu
            gafete Azul FICTI.
          </p>
        </div>

        <div className={styles.card}>
          <div className={styles.progress}>
            <div className={`${styles.progressItem} ${step === 'form' ? styles.active : styles.done}`}>
              01 Formulario
            </div>
            <div className={`${styles.progressItem} ${step === 'review' ? styles.active : ''}`}>
              02 Revisa tu info
            </div>
            <div className={styles.progressItem}>03 Confirmación</div>
          </div>

          <div className={styles.cardBody}>
            {error ? <p className={styles.error}>{error}</p> : null}

            {step === 'form' ? (
              <form onSubmit={goReview}>
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Datos del estudiante</h2>
                  <div className={styles.group}>
                    <label className={styles.label} htmlFor="email">
                      Email<span className={styles.required}>*</span>
                    </label>
                    <input
                      className={styles.input}
                      id="email"
                      type="email"
                      required
                      placeholder="tu@correo.com"
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                    />
                  </div>
                  <div className={styles.grid2}>
                    <div className={styles.group}>
                      <label className={styles.label} htmlFor="nombre">
                        Nombre<span className={styles.required}>*</span>
                      </label>
                      <input
                        className={styles.input}
                        id="nombre"
                        required
                        style={{ textTransform: 'uppercase' }}
                        value={form.nombre}
                        onInput={toUpperCaseInput}
                        onChange={(e) => update('nombre', e.target.value)}
                      />
                    </div>
                    <div className={styles.group}>
                      <label className={styles.label} htmlFor="apellidoPaterno">
                        Apellido paterno<span className={styles.required}>*</span>
                      </label>
                      <input
                        className={styles.input}
                        id="apellidoPaterno"
                        required
                        style={{ textTransform: 'uppercase' }}
                        value={form.apellidoPaterno}
                        onInput={toUpperCaseInput}
                        onChange={(e) => update('apellidoPaterno', e.target.value)}
                      />
                    </div>
                  </div>
                  <PhoneField
                    countryCode={form.phoneCountry}
                    localNumber={form.telefono}
                    onCountryChange={(code) => {
                      update('phoneCountry', code)
                      update('telefono', '')
                    }}
                    onNumberChange={(value) => update('telefono', value)}
                  />
                </section>

                <div className={styles.actions}>
                  <Link className={styles.btnGhost} to="/">
                    Cancelar
                  </Link>
                  <button className={styles.btnPrimary} type="submit">
                    Continuar a revisión
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Resumen de tu registro</h2>
                  <div className={styles.summary}>
                    <div className={styles.summaryRow}>
                      <strong>Email</strong>
                      <span>{form.email}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <strong>Nombre</strong>
                      <span>{nombreCompleto}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <strong>Teléfono</strong>
                      <span>{phoneDisplay}</span>
                    </div>
                  </div>
                </section>

                <div className={styles.previewBlock}>
                  <div className={styles.previewCopy}>
                    <h3>Vista previa del gafete</h3>
                    <p>
                      Gafete Azul FICTI con logo Gabor. Tras confirmar el correo recibirás tu
                      código QR digital.
                    </p>
                    <p className={styles.leyenda}>{LEYENDA_CANJE}</p>
                  </div>
                  <BadgePreview variant="estudiante" nombre={nombreCompleto} />
                </div>

                <div className={styles.actions}>
                  <button className={styles.btnGhost} type="button" onClick={() => setStep('form')}>
                    Editar datos
                  </button>
                  <button
                    className={styles.btnPrimary}
                    type="button"
                    disabled={loading}
                    onClick={submitRegistro}
                  >
                    {loading ? 'Enviando…' : 'Confirmar registro'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
