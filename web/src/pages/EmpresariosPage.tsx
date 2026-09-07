import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { postForm } from '../api/registro'
import AppShell from '../components/AppShell'
import PhoneField from '../components/PhoneField'
import { RegistrationSuccess } from '../components/RegistrationSuccess'
import {
  AREAS_INTERES_FICTI,
  AREAS_INTERES_TECH,
  AREAS_RESPONSABILIDAD,
  emptyEmpresaForm,
  POSICIONES_EMPRESA,
  RANGOS_EDAD,
  type EmpresaFormData,
} from '../constants/registro'
import { leerAreaInteres } from '../lib/areaInteres'
import { findDial, formatPhoneDisplay, validateLocalPhone } from '../constants/phone'
import { toUpperCaseInput } from '../utils/forms'
import styles from '../styles/flow.module.scss'

type Step = 'form' | 'review' | 'done'

export default function EmpresariosPage() {
  const [step, setStep] = useState<Step>('form')
  const [form, setForm] = useState<EmpresaFormData>(emptyEmpresaForm)
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

  const posicionFinal =
    form.posicionEmpresa === 'Otro' && form.otroPosicion.trim()
      ? `Otro: ${form.otroPosicion.trim()}`
      : form.posicionEmpresa

  function update<K extends keyof EmpresaFormData>(key: K, value: EmpresaFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleProducto(value: string) {
    setForm((prev) => {
      const exists = prev.productosInteres.includes(value)
      return {
        ...prev,
        productosInteres: exists
          ? prev.productosInteres.filter((item) => item !== value)
          : [...prev.productosInteres, value],
      }
    })
  }

  function validateForm() {
    if (!form.email || !form.emailConfirm) return 'El correo y su verificación son obligatorios.'
    if (form.email.trim().toLowerCase() !== form.emailConfirm.trim().toLowerCase()) {
      return 'Los correos no coinciden.'
    }
    if (!form.edad) return 'Selecciona tu rango de edad.'
    if (!form.nombre || !form.apellidoPaterno || !form.empresa) {
      return 'Completa nombre, apellido y empresa.'
    }
    const phoneError = validateLocalPhone(form.phoneCountry, form.telefono)
    if (phoneError) return phoneError
    if (!form.ciudad) return 'La ciudad es obligatoria.'
    if (!form.estado) return 'El estado es obligatorio.'
    if (!form.posicionEmpresa) return 'Selecciona la posición en la empresa.'
    if (form.posicionEmpresa === 'Otro' && !form.otroPosicion.trim()) {
      return 'Describe la opción “Otro” en posición.'
    }
    if (!form.areaResponsabilidad) return 'Selecciona tu área de responsabilidad.'
    if (form.productosInteres.length === 0) return 'Selecciona al menos un área de interés.'
    return ''
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
    const result = await postForm('/registro_empresario', {
      email: form.email.trim().toLowerCase(),
      nombre: form.nombre.trim().toUpperCase(),
      apellido_paterno: form.apellidoPaterno.trim().toUpperCase(),
      empresa: form.empresa.trim().toUpperCase(),
      lada_pais: findDial(form.phoneCountry).dial,
      telefono: form.telefono.trim(),
      ciudad: form.ciudad.trim().toUpperCase(),
      estado: form.estado.trim().toUpperCase(),
      edad: form.edad,
      posicion_empresa: posicionFinal,
      area_responsabilidad: form.areaResponsabilidad,
      productos_interes: form.productosInteres,
      // Respuesta del pop-up de portada. Puede faltar si el visitante entró
      // directo a /empresarios sin pasar por la home.
      area_interes_general: leerAreaInteres() ?? '',
      pais: form.phoneCountry === 'MX' ? 'MEXICO' : form.phoneCountry,
      codigo_postal: '00000',
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
      <AppShell variant="empresa">
        <RegistrationSuccess title="Registro empresarial enviado">
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
    <AppShell variant="empresa">
      <div className={styles.shell}>
        <div className={styles.hero}>
          <p className={styles.kicker}>Acreditación corporativa</p>
          <h1 className={styles.title}>Registro Empresa</h1>
          <p className={styles.subtitle}>
            Completa la información oficial. En el siguiente paso revisas tus datos y, al confirmar,
            te enviamos un correo para validar tu registro.
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
                  <h2 className={styles.sectionTitle}>Datos de contacto</h2>
                  <div className={styles.grid2}>
                    <div className={styles.group}>
                      <label className={styles.label} htmlFor="email">
                        Email<span className={styles.required}>*</span>
                      </label>
                      <input
                        className={styles.input}
                        id="email"
                        type="email"
                        required
                        placeholder="nombre@empresa.com"
                        value={form.email}
                        onChange={(e) => update('email', e.target.value)}
                      />
                    </div>
                    <div className={styles.group}>
                      <label className={styles.label} htmlFor="emailConfirm">
                        Verificación de email<span className={styles.required}>*</span>
                      </label>
                      <input
                        className={styles.input}
                        id="emailConfirm"
                        type="email"
                        required
                        placeholder="Confirma tu correo"
                        value={form.emailConfirm}
                        onChange={(e) => update('emailConfirm', e.target.value)}
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
                </section>

                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Identidad y empresa</h2>
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
                    <div className={styles.group}>
                      <label className={styles.label} htmlFor="empresa">
                        Empresa<span className={styles.required}>*</span>
                      </label>
                      <input
                        className={styles.input}
                        id="empresa"
                        required
                        style={{ textTransform: 'uppercase' }}
                        value={form.empresa}
                        onInput={toUpperCaseInput}
                        onChange={(e) => update('empresa', e.target.value)}
                      />
                    </div>
                    <div className={styles.group}>
                      <label className={styles.label} htmlFor="ciudad">
                        Ciudad<span className={styles.required}>*</span>
                      </label>
                      <input
                        className={styles.input}
                        id="ciudad"
                        required
                        style={{ textTransform: 'uppercase' }}
                        value={form.ciudad}
                        onInput={toUpperCaseInput}
                        onChange={(e) => update('ciudad', e.target.value)}
                      />
                    </div>
                    <div className={styles.group}>
                      <label className={styles.label} htmlFor="estado">
                        Estado<span className={styles.required}>*</span>
                      </label>
                      <input
                        className={styles.input}
                        id="estado"
                        required
                        style={{ textTransform: 'uppercase' }}
                        value={form.estado}
                        onInput={toUpperCaseInput}
                        onChange={(e) => update('estado', e.target.value)}
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

                  <div className={styles.group}>
                    <label className={styles.label} htmlFor="posicionEmpresa">
                      Posición en la empresa
                    </label>
                    <select
                      className={styles.select}
                      id="posicionEmpresa"
                      required
                      value={form.posicionEmpresa}
                      onChange={(e) => update('posicionEmpresa', e.target.value)}
                    >
                      <option value="" disabled>
                        Seleccione una opción
                      </option>
                      {POSICIONES_EMPRESA.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>

                  {form.posicionEmpresa === 'Otro' ? (
                    <div className={styles.group}>
                      <label className={styles.label} htmlFor="otroPosicion">
                        Especifica “Otro”
                      </label>
                      <input
                        className={styles.input}
                        id="otroPosicion"
                        value={form.otroPosicion}
                        onChange={(e) => update('otroPosicion', e.target.value)}
                      />
                    </div>
                  ) : null}
                </section>

                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Responsabilidad en la empresa</h2>
                  <div className={styles.options}>
                    {AREAS_RESPONSABILIDAD.map((area) => (
                      <label className={styles.option} key={area}>
                        <input
                          type="radio"
                          name="area_responsabilidad"
                          checked={form.areaResponsabilidad === area}
                          onChange={() => update('areaResponsabilidad', area)}
                        />
                        {area}
                      </label>
                    ))}
                  </div>
                </section>

                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Áreas de interés</h2>
                  {/* Dos bloques por marca: FICTI es impresión y manufactura,
                      Tech Capital es turismo y negocio. La selección sigue
                      viajando en un solo arreglo — los valores no se repiten
                      entre bloques, así que el origen se deduce del valor. */}
                  <div className={styles.brandGroups}>
                    <div className={`${styles.brandGroup} ${styles.brandGroupFicti}`}>
                      {/* Nombre en texto y no el PNG: los logotipos blancos
                          traen mucho aire alrededor y dentro de la píldora
                          quedaban diminutos. El mock del cliente también los
                          muestra escritos. */}
                      <span className={styles.brandGroupHead}>FICTI</span>
                      <div className={styles.brandGroupList}>
                        {AREAS_INTERES_FICTI.map((area) => (
                          <label className={styles.option} key={area}>
                            <input
                              type="checkbox"
                              checked={form.productosInteres.includes(area)}
                              onChange={() => toggleProducto(area)}
                            />
                            {area}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className={`${styles.brandGroup} ${styles.brandGroupTech}`}>
                      <span className={styles.brandGroupHead}>TECH CAPITAL</span>
                      <div className={styles.brandGroupList}>
                        {AREAS_INTERES_TECH.map((area) => (
                          <label className={styles.option} key={area}>
                            <input
                              type="checkbox"
                              checked={form.productosInteres.includes(area)}
                              onChange={() => toggleProducto(area)}
                            />
                            {area}
                          </label>
                        ))}
                      </div>
                    </div>
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
                      <strong>Empresa</strong>
                      <span>{form.empresa}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <strong>Teléfono</strong>
                      <span>{phoneDisplay}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <strong>Ciudad</strong>
                      <span>{form.ciudad}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <strong>Estado</strong>
                      <span>{form.estado}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <strong>Posición</strong>
                      <span>{posicionFinal}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <strong>Responsabilidad</strong>
                      <span>{form.areaResponsabilidad}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <strong>Edad</strong>
                      <span>{form.edad}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <strong>Áreas de interés</strong>
                      <span>{form.productosInteres.join(', ')}</span>
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
