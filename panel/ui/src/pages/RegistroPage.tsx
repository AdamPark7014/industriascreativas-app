import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  horaCorta,
  mesa,
  tiene,
  type AltaDatos,
  type AltaResp,
  type MiAlta,
  type PersonaExistente,
  type Sesion,
  type TipoAlta,
} from '../api'
import {
  AREAS_EXPLORAR,
  AREAS_INTERES_FICTI,
  AREAS_INTERES_TECH,
  AREAS_RESPONSABILIDAD,
  COMPETENCIAS,
  LADAS,
  POSICIONES_EMPRESA,
  RANGOS_EDAD,
  TIPOS_INSTITUCION,
  buscarLada,
  validarTelefono,
} from '../lib/registroOpciones'
import { correoSugerido } from '../lib/correoSugerido'
import { etiquetaDispositivo, useBoletoImpresion } from '../lib/useBoletoImpresion'
import styles from './registro.module.scss'

type Form = {
  correo: string
  nombre: string
  apellidoPaterno: string
  edad: string
  pais: string
  telefono: string
  areaInteresGeneral: string
  empresa: string
  ciudad: string
  estado: string
  posicionEmpresa: string
  otraPosicion: string
  areaResponsabilidad: string
  productosInteres: string[]
  tipoInstitucion: string
  carrera: string
  competencias: string[]
}

const formVacio = (): Form => ({
  correo: '',
  nombre: '',
  apellidoPaterno: '',
  edad: '',
  pais: 'MX',
  telefono: '',
  areaInteresGeneral: '',
  empresa: '',
  ciudad: '',
  estado: '',
  posicionEmpresa: '',
  otraPosicion: '',
  areaResponsabilidad: '',
  productosInteres: [],
  tipoInstitucion: '',
  carrera: '',
  competencias: [],
})

type Hecho = Extract<AltaResp, { ok: true }>

const CORREO_RE = /^[\w.+-]+@[\w.-]+\.\w+$/

function validar(tipo: TipoAlta, f: Form): string | null {
  const correo = f.correo.trim()
  if (!CORREO_RE.test(correo)) return 'Escribe un correo válido.'
  if (tipo === 'estudiantes' && correo.length > 50) return 'El correo de estudiante admite máximo 50 caracteres.'
  if (!f.nombre.trim() || !f.apellidoPaterno.trim()) return 'Nombre y apellido son obligatorios.'
  if (!f.edad) return 'Selecciona el rango de edad.'
  const tel = validarTelefono(f.pais, f.telefono)
  if (tel) return tel
  if (!f.areaInteresGeneral) return 'Selecciona qué le interesa explorar.'
  if (tipo === 'empresas') {
    if (!f.empresa.trim()) return 'La empresa es obligatoria.'
    if (!f.posicionEmpresa) return 'Selecciona la posición en la empresa.'
    if (f.posicionEmpresa === 'Otro' && !f.otraPosicion.trim()) return 'Describe la posición «Otro».'
    if (!f.areaResponsabilidad) return 'Selecciona el área de responsabilidad.'
    if (!f.ciudad.trim() || !f.estado.trim()) return 'Ciudad y estado son obligatorios.'
    if (!f.productosInteres.length) return 'Selecciona al menos un área de interés.'
  } else {
    if (!f.tipoInstitucion) return 'Selecciona el tipo de institución.'
    if (f.tipoInstitucion === 'Universidad' && !f.carrera.trim()) return 'Escribe la carrera.'
    if (!f.competencias.length) return 'Indica la competencia o «Ninguna».'
  }
  return null
}

function datosAlta(tipo: TipoAlta, f: Form, enviarCorreo: boolean): AltaDatos {
  const comunes = {
    tipo,
    correo: f.correo.trim().toLowerCase(),
    nombre: f.nombre.trim().toUpperCase(),
    apellidoPaterno: f.apellidoPaterno.trim().toUpperCase(),
    edad: f.edad,
    lada: buscarLada(f.pais).dial,
    telefono: f.telefono.replace(/\D/g, ''),
    areaInteresGeneral: f.areaInteresGeneral,
    enviarCorreo,
    dispositivo: etiquetaDispositivo(),
  }
  if (tipo === 'empresas') {
    return {
      ...comunes,
      empresa: f.empresa.trim().toUpperCase(),
      ciudad: f.ciudad.trim().toUpperCase(),
      estado: f.estado.trim().toUpperCase(),
      posicionEmpresa:
        f.posicionEmpresa === 'Otro' ? `Otro: ${f.otraPosicion.trim()}` : f.posicionEmpresa,
      areaResponsabilidad: f.areaResponsabilidad,
      productosInteres: f.productosInteres,
      // Mismo criterio que el formulario público.
      pais: f.pais === 'MX' ? 'MEXICO' : f.pais,
    }
  }
  return {
    ...comunes,
    tipoInstitucion: f.tipoInstitucion,
    carrera: f.tipoInstitucion === 'Universidad' ? f.carrera.trim().toUpperCase() : '',
    competencias: f.competencias,
  }
}

export default function RegistroPage() {
  const sesion = useOutletContext<Sesion | null>()
  const [tipo, setTipo] = useState<TipoAlta>('empresas')
  const [form, setForm] = useState<Form>(formVacio)
  const [enviarCorreo, setEnviarCorreo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existente, setExistente] = useState<PersonaExistente | null>(null)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const [altas, setAltas] = useState<MiAlta[]>([])
  const [correoAceptado, setCorreoAceptado] = useState('')
  const correoRef = useRef<HTMLInputElement>(null)

  const cargarAltas = useCallback(() => {
    void mesa
      .misAltas()
      .then((r) => setAltas(r.altas))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    cargarAltas()
  }, [cargarAltas])

  useEffect(() => {
    if (!hecho) correoRef.current?.focus()
  }, [hecho])

  const onContador = useCallback((t: string, id: number, total: number) => {
    setAltas((prev) => prev.map((a) => (a.tipo === t && a.id === id ? { ...a, impresiones: total } : a)))
  }, [])

  const impresion = useBoletoImpresion({ sesion, onContador, textoCerrar: 'Listo' })

  const poner = <K extends keyof Form>(clave: K, valor: Form[K]) => setForm((f) => ({ ...f, [clave]: valor }))

  const alternar = (clave: 'productosInteres' | 'competencias', valor: string) =>
    setForm((f) => {
      const actual = f[clave]
      if (clave === 'competencias' && valor === 'Ninguna') {
        return { ...f, competencias: actual.includes('Ninguna') ? [] : ['Ninguna'] }
      }
      const base = clave === 'competencias' ? actual.filter((v) => v !== 'Ninguna') : actual
      return { ...f, [clave]: base.includes(valor) ? base.filter((v) => v !== valor) : [...base, valor] }
    })

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const msg = validar(tipo, form)
    if (msg) {
      setError(msg)
      return
    }
    const posible = correoSugerido(form.correo)
    if (posible && correoAceptado !== form.correo.trim()) {
      setCorreoAceptado(form.correo.trim())
      setExistente(null)
      setError(
        `Revisa el correo: ¿quisiste decir ${posible}? Corrígelo arriba o, si está bien así, toca «Registrar e imprimir» otra vez.`,
      )
      return
    }
    setEnviando(true)
    setError(null)
    setExistente(null)
    try {
      const r = await mesa.registrar(datosAlta(tipo, form, enviarCorreo))
      if (!r.ok) {
        setError(r.mensaje)
        setExistente(r.existente ?? null)
        return
      }
      setHecho(r)
      cargarAltas()
      void impresion.abrir(r.tipo, r.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar')
    } finally {
      setEnviando(false)
    }
  }

  const otraPersona = () => {
    setHecho(null)
    setForm(formVacio())
    setCorreoAceptado('')
    setEnviarCorreo(false)
    setError(null)
    setExistente(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toast = impresion.toast
  const sugerencia = CORREO_RE.test(form.correo.trim()) ? correoSugerido(form.correo) : null
  const lada = buscarLada(form.pais)
  const placeholderTel =
    lada.minLen === lada.maxLen ? `${lada.maxLen} dígitos` : `${lada.minLen} a ${lada.maxLen} dígitos`

  return (
    <main className={styles.page}>
      {impresion.estado}

      <div className={styles.layout}>
      <div className={styles.columna}>
      {hecho ? (
        <section className={styles.hecho} aria-live="polite">
          <p className={styles.kicker}>Registro listo · ya puede entrar</p>
          <h2>{hecho.nombre}</h2>
          <p className={styles.folio}>
            {hecho.folio} · {hecho.correo}
          </p>
          {hecho.envio ? (
            hecho.envio.ok ? (
              <p className={styles.ok}>Boleto digital enviado a {hecho.correo}.</p>
            ) : (
              <p className={styles.aviso}>
                No se pudo enviar el correo ({hecho.envio.mensaje || hecho.envio.error}). La etiqueta
                impresa sí sirve para entrar.
              </p>
            )
          ) : null}
          <div className={styles.accionesHecho}>
            <button
              type="button"
              className={styles.primario}
              disabled={impresion.ocupado(hecho.tipo, hecho.id)}
              onClick={() => void impresion.abrir(hecho.tipo, hecho.id)}
            >
              {impresion.ocupado(hecho.tipo, hecho.id) ? 'Preparando…' : 'Imprimir etiqueta (QR + nombre)'}
            </button>
            <button type="button" className={styles.secundario} onClick={otraPersona}>
              Registrar a otra persona
            </button>
          </div>
        </section>
      ) : (
        <form className={styles.form} onSubmit={(e) => void enviar(e)} noValidate>
          <div className={styles.tabs} role="tablist" aria-label="Tipo de registro">
            {(
              [
                ['empresas', 'Empresa / profesional'],
                ['estudiantes', 'Estudiante'],
              ] as const
            ).map(([clave, etiqueta]) => (
              <button
                key={clave}
                type="button"
                role="tab"
                aria-selected={tipo === clave}
                className={tipo === clave ? styles.tabOn : styles.tab}
                onClick={() => setTipo(clave)}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          <p className={styles.indicacion}>Todos los campos son obligatorios, igual que en el registro en línea.</p>

          <fieldset className={styles.bloque}>
            <legend>Datos de la persona</legend>
            <div className={styles.grid}>
              <label className={styles.ancho}>
                <span>Correo</span>
                <input
                  ref={correoRef}
                  type="email"
                  inputMode="email"
                  value={form.correo}
                  onChange={(e) => poner('correo', e.target.value)}
                  placeholder="nombre@empresa.com"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                {sugerencia ? (
                  <button type="button" className={styles.sugerencia} onClick={() => poner('correo', sugerencia)}>
                    ¿Quisiste decir <b>{sugerencia}</b>? Toca para corregir
                  </button>
                ) : null}
              </label>
              <label>
                <span>Nombre(s)</span>
                <input value={form.nombre} onChange={(e) => poner('nombre', e.target.value)} autoComplete="off" />
              </label>
              <label>
                <span>Apellido paterno</span>
                <input
                  value={form.apellidoPaterno}
                  onChange={(e) => poner('apellidoPaterno', e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                <span>Edad</span>
                <select value={form.edad} onChange={(e) => poner('edad', e.target.value)}>
                  <option value="">Selecciona…</option>
                  {RANGOS_EDAD.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Teléfono</span>
                <div className={styles.telefono}>
                  <select
                    value={form.pais}
                    onChange={(e) => poner('pais', e.target.value)}
                    aria-label="Lada del país"
                  >
                    {LADAS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.code} {l.dial}
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="tel"
                    value={form.telefono}
                    onChange={(e) => poner('telefono', e.target.value)}
                    placeholder={placeholderTel}
                    autoComplete="off"
                  />
                </div>
              </label>
              <label className={styles.ancho}>
                <span>¿Qué le interesa explorar?</span>
                <select
                  value={form.areaInteresGeneral}
                  onChange={(e) => poner('areaInteresGeneral', e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {AREAS_EXPLORAR.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          {tipo === 'empresas' ? (
            <fieldset className={styles.bloque}>
              <legend>Empresa</legend>
              <div className={styles.grid}>
                <label className={styles.ancho}>
                  <span>Empresa</span>
                  <input value={form.empresa} onChange={(e) => poner('empresa', e.target.value)} autoComplete="off" />
                </label>
                <label>
                  <span>Posición en la empresa</span>
                  <select value={form.posicionEmpresa} onChange={(e) => poner('posicionEmpresa', e.target.value)}>
                    <option value="">Selecciona…</option>
                    {POSICIONES_EMPRESA.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Área de responsabilidad</span>
                  <select
                    value={form.areaResponsabilidad}
                    onChange={(e) => poner('areaResponsabilidad', e.target.value)}
                  >
                    <option value="">Selecciona…</option>
                    {AREAS_RESPONSABILIDAD.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                {form.posicionEmpresa === 'Otro' ? (
                  <label className={styles.ancho}>
                    <span>¿Qué posición?</span>
                    <input value={form.otraPosicion} onChange={(e) => poner('otraPosicion', e.target.value)} />
                  </label>
                ) : null}
                <label>
                  <span>Ciudad</span>
                  <input value={form.ciudad} onChange={(e) => poner('ciudad', e.target.value)} autoComplete="off" />
                </label>
                <label>
                  <span>Estado</span>
                  <input value={form.estado} onChange={(e) => poner('estado', e.target.value)} autoComplete="off" />
                </label>
              </div>
              <p className={styles.subtitulo}>Áreas de interés · FICTI</p>
              <div className={styles.chips}>
                {AREAS_INTERES_FICTI.map((a) => (
                  <label key={a} className={form.productosInteres.includes(a) ? styles.chipOn : styles.chip}>
                    <input
                      type="checkbox"
                      checked={form.productosInteres.includes(a)}
                      onChange={() => alternar('productosInteres', a)}
                    />
                    {a}
                  </label>
                ))}
              </div>
              <p className={styles.subtitulo}>Áreas de interés · Tech Capital</p>
              <div className={styles.chips}>
                {AREAS_INTERES_TECH.map((a) => (
                  <label key={a} className={form.productosInteres.includes(a) ? styles.chipOn : styles.chip}>
                    <input
                      type="checkbox"
                      checked={form.productosInteres.includes(a)}
                      onChange={() => alternar('productosInteres', a)}
                    />
                    {a}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset className={styles.bloque}>
              <legend>Escuela</legend>
              <p className={styles.subtitulo}>Tipo de institución</p>
              <div className={styles.chips}>
                {TIPOS_INSTITUCION.map((t) => (
                  <label key={t} className={form.tipoInstitucion === t ? styles.chipOn : styles.chip}>
                    <input
                      type="radio"
                      name="tipoInstitucion"
                      checked={form.tipoInstitucion === t}
                      onChange={() => poner('tipoInstitucion', t)}
                    />
                    {t}
                  </label>
                ))}
              </div>
              {form.tipoInstitucion === 'Universidad' ? (
                <div className={styles.grid}>
                  <label className={styles.ancho}>
                    <span>Carrera</span>
                    <input
                      value={form.carrera}
                      onChange={(e) => poner('carrera', e.target.value)}
                      placeholder="Ej. Ingeniería en sistemas"
                    />
                  </label>
                </div>
              ) : null}
              <p className={styles.subtitulo}>¿Participa en alguna competencia?</p>
              <div className={styles.chips}>
                {COMPETENCIAS.map((c) => (
                  <label key={c} className={form.competencias.includes(c) ? styles.chipOn : styles.chip}>
                    <input
                      type="checkbox"
                      checked={form.competencias.includes(c)}
                      onChange={() => alternar('competencias', c)}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {error ? (
            <div className={styles.alerta} role="alert">
              {error}
              {existente ? (
                <div className={styles.existente}>
                  <strong>
                    {existente.nombre} · {existente.folio}
                    {existente.confirmado ? '' : ' · sin confirmar'}
                  </strong>
                  {tiene(sesion, 'buscar') ? (
                    <Link to={`/buscar?q=${encodeURIComponent(existente.folio)}`}>Abrir su ficha →</Link>
                  ) : (
                    <span>Mándala a la mesa de impresión con este folio.</span>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={styles.pie}>
            <label className={styles.casilla}>
              <input type="checkbox" checked={enviarCorreo} onChange={(e) => setEnviarCorreo(e.target.checked)} />
              <span>
                Enviar también el boleto digital por correo
                <small>Apagado: no se manda correo; la persona se lleva su etiqueta impresa.</small>
              </span>
            </label>
            <button type="submit" className={styles.primario} disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar e imprimir'}
            </button>
          </div>
        </form>
      )}

      {impresion.error ? <div className={styles.alerta}>{impresion.error}</div> : null}
      {toast ? (
        <p className={toast.tono === 'ok' ? styles.ok : styles.aviso} role="status">
          {toast.texto}
        </p>
      ) : null}
      </div>

      {altas.length ? (
        <aside className={styles.altas}>
          <h2>Tus últimos registros</h2>
          <ul>
            {altas.map((a) => (
              <li key={`${a.tipo}-${a.id}`}>
                <div>
                  <strong>{a.nombre}</strong>
                  <span>
                    {a.folio}
                    {horaCorta(a.creado) ? ` · ${horaCorta(a.creado)}` : ''}
                    {a.impresiones ? ` · impreso ×${a.impresiones}` : ' · sin imprimir'}
                  </span>
                </div>
                {sesion?.puedeImprimir ? (
                  <button
                    type="button"
                    className={styles.secundario}
                    disabled={impresion.ocupado(a.tipo, a.id)}
                    onClick={() => void impresion.abrir(a.tipo, a.id, { impresiones: a.impresiones })}
                  >
                    {impresion.ocupado(a.tipo, a.id) ? 'Preparando…' : a.impresiones ? 'Reimprimir' : 'Imprimir'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      </div>

      {impresion.modal}
    </main>
  )
}
