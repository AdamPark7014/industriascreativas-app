import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { postForm } from '../api/registro'
import AppShell from '../components/AppShell'
import PhoneField from '../components/PhoneField'
import { RegistrationSuccess } from '../components/RegistrationSuccess'
import {
  COMPETENCIAS,
  emptyEstudianteForm,
  RANGOS_EDAD,
  TIPOS_INSTITUCION,
  type EstudianteFormData,
} from '../constants/registro'
import { leerAreaInteres } from '../lib/areaInteres'
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

  /** 'Ninguna' es excluyente: marcarla limpia el resto y viceversa. */
  function toggleCompetencia(value: string) {
    setForm((prev) => {
      if (value === 'Ninguna') {
        return { ...prev, competencias: prev.competencias.includes('Ninguna') ? [] : ['Ninguna'] }
      }
      const sinNinguna = prev.competencias.filter((item) => item !== 'Ninguna')
      return {
        ...prev,
        competencias: sinNinguna.includes(value)
          ? sinNinguna.filter((item) => item !== value)
          : [...sinNinguna, value],
      }
    })
  }

  function validateForm() {
    if (!form.email) return 'El correo es obligatorio.'
    if (!form.edad) return 'Selecciona tu rango de edad.'
    if (!form.nombre || !form.apellidoPaterno) return 'Nombre y apellido son obligatorios.'
    if (!form.tipoInstitucion) return 'Selecciona el tipo de institución.'
    // La carrera solo existe si es universidad; pedirla a un preparatoriano
    // sería un campo obligatorio imposible de llenar.
    if (form.tipoInstitucion === 'Universidad' && !form.carrera.trim()) {
      return 'Escribe tu carrera.'
    }
    if (form.competencias.length === 0) {
      return 'Indica si participas en alguna competencia (o elige «Ninguna»).'
    }
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
      edad: form.edad,
      nombre: form.nombre.trim().toUpperCase(),
      apellido_paterno: form.apellidoPaterno.trim().toUpperCase(),
      lada_pais: findDial(form.phoneCountry).dial,
      telefono: form.telefono.trim(),
      tipo_institucion: form.tipoInstitucion,
      carrera: form.tipoInstitucion === 'Universidad' ? form.carrera.trim().toUpperCase() : '',
      competencias: form.competencias,
      // Respuesta del pop-up de portada; vacía si entró directo a /estudiantes.
      area_interes_general: leerAreaInteres() ?? '',
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
      <AppShell variant="estudiante">
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
    <AppShell variant="estudiante">
      <div className={styles.shell}>
        <div className={styles.hero}>
          <p className={styles.kicker}>Acreditación estudiantil</p>
          <h1 className={styles.title}>Registro Estudiante</h1>
          <p className={styles.subtitle}>
            Solo pedimos los datos esenciales. En el siguiente paso revisas tu información y, al
            confirmar, te enviamos un correo para validar tu registro.
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
                  <div className={styles.group}>
                    <label className={styles.label} htmlFor="edad">
                      Edad<span className={styles.required}>*</span>
                    </label>
                    <select
                      className={styles.select}
                      id="edad"
                      required
                      value={form.edad}
                      onChange={(e) => update('edad', e.target.value)}
                    >
                      <option value="">Selecciona tu rango de edad</option>
                      {RANGOS_EDAD.map((rango) => (
                        <option key={rango} value={rango}>
                          {rango}
                        </option>
                      ))}
                    </select>
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
                  <div className={styles.group}>
                    <label className={styles.label} htmlFor="tipoInstitucion">
                      Tipo de institución<span className={styles.required}>*</span>
                    </label>
                    <select
                      className={styles.select}
                      id="tipoInstitucion"
                      required
                      value={form.tipoInstitucion}
                      onChange={(e) => {
                        update('tipoInstitucion', e.target.value)
                        // Cambiar a preparatoria borra la carrera: dejarla
                        // guardada mandaría un dato que ya no aplica.
                        if (e.target.value !== 'Universidad') update('carrera', '')
                      }}
                    >
                      <option value="">Selecciona una opción</option>
                      {TIPOS_INSTITUCION.map((tipo) => (
                        <option key={tipo} value={tipo}>
                          {tipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  {form.tipoInstitucion === 'Universidad' ? (
                    <div className={styles.group}>
                      <label className={styles.label} htmlFor="carrera">
                        Carrera<span className={styles.required}>*</span>
                      </label>
                      <input
                        className={styles.input}
                        id="carrera"
                        required
                        style={{ textTransform: 'uppercase' }}
                        placeholder="Ej. Ingeniería en sistemas"
                        value={form.carrera}
                        onInput={toUpperCaseInput}
                        onChange={(e) => update('carrera', e.target.value)}
                      />
                    </div>
                  ) : null}
                </section>

                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>
                    ¿Participas en una competencia de las siguientes?
                  </h2>
                  <div className={styles.options}>
                    {COMPETENCIAS.map((competencia) => (
                      <label className={styles.option} key={competencia}>
                        <input
                          type="checkbox"
                          checked={form.competencias.includes(competencia)}
                          onChange={() => toggleCompetencia(competencia)}
                        />
                        {competencia}
                      </label>
                    ))}
                  </div>
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
                    <div className={styles.summaryRow}>
                      <strong>Edad</strong>
                      <span>{form.edad}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <strong>Tipo de institución</strong>
                      <span>{form.tipoInstitucion}</span>
                    </div>
                    {form.tipoInstitucion === 'Universidad' ? (
                      <div className={styles.summaryRow}>
                        <strong>Carrera</strong>
                        <span>{form.carrera}</span>
                      </div>
                    ) : null}
                    <div className={styles.summaryRow}>
                      <strong>Competencia</strong>
                      <span>{form.competencias.join(', ')}</span>
                    </div>
                  </div>
                </section>

                <div className={styles.confirmNote}>
                  <h3>Siguiente paso: confirma tu correo</h3>
                  <p>
                    Al confirmar este registro te enviaremos un enlace a tu correo. Debes abrirlo
                    para validar tu acreditación y recibir tu gafete digital con código QR. El día
                    del evento canjeas ese gafete digital por el físico en taquilla.
                  </p>
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
