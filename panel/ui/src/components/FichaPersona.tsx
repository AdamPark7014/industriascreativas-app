import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { fechaHora, mesa, tiene, type EventoCorreo, type Ficha, type Sesion } from '../api'
import type { PrevioImpresion } from '../lib/useBoletoImpresion'
import styles from './ficha.module.scss'

type Props = {
  tipo: string
  id: number
  sesion: Sesion | null
  /** Sube cuando algo cambió fuera (p. ej. se imprimió): recarga la ficha. */
  version: number
  /** El preview de impresión de esta persona se está preparando. */
  ocupado: boolean
  onImprimir: (previo: PrevioImpresion) => void
  /** Algo de la persona cambió aquí (confirmación, reenvío): la lista puede refrescarse. */
  onCambio?: () => void
  onClose: () => void
}

type Tono = 'ok' | 'mal' | 'neutro'

/** Eventos del reporte transaccional de Brevo. */
const EVENTOS: Record<string, { texto: string; tono: Tono }> = {
  requests: { texto: 'Enviado', tono: 'neutro' },
  delivered: { texto: 'Entregado', tono: 'ok' },
  opened: { texto: 'Abierto', tono: 'ok' },
  loadedByProxy: { texto: 'Abierto (vista previa del proveedor)', tono: 'ok' },
  clicks: { texto: 'Clic en el enlace', tono: 'ok' },
  deferred: { texto: 'Entrega retrasada', tono: 'neutro' },
  softBounces: { texto: 'Rebote temporal', tono: 'mal' },
  hardBounces: { texto: 'Rebote: el correo no existe', tono: 'mal' },
  bounces: { texto: 'Rebotado', tono: 'mal' },
  blocked: { texto: 'Bloqueado por Brevo', tono: 'mal' },
  invalid: { texto: 'Correo inválido', tono: 'mal' },
  spam: { texto: 'Marcado como spam', tono: 'mal' },
  unsubscribed: { texto: 'Se dio de baja', tono: 'neutro' },
  error: { texto: 'Error de envío', tono: 'mal' },
}
const FALLAS = ['hardBounces', 'softBounces', 'bounces', 'blocked', 'invalid', 'spam', 'error']

const MOTIVOS: Record<string, string> = {
  confirmacion: 'Al confirmar',
  reenvio: 'Reenvío',
  alta_sitio: 'Alta en sitio',
}
const VIAS: Record<string, string> = { ql: 'Brother QL-800', chrome: 'Chrome', pdf: 'PDF', test: 'Prueba' }

const veces = (n: number) => (n === 1 ? '1 vez' : `${n} veces`)

/** Solo cuentan los correos del boleto (no el de "confirma tu registro"). */
const esDelBoleto = (e: EventoCorreo) => !e.asunto || /gafete|boleto/i.test(e.asunto)

function resumenBoleto(f: Ficha, eventos: EventoCorreo[] | null): { texto: string; tono: Tono } {
  if (f.descargas.total > 0) {
    const ultima = fechaHora(f.descargas.ultima)
    return {
      texto: `Descargó su boleto desde el correo (${veces(f.descargas.total)}${ultima ? `, última ${ultima}` : ''}).`,
      tono: 'ok',
    }
  }
  const delBoleto = (eventos ?? []).filter(esDelBoleto)
  const hay = (claves: string[]) => delBoleto.some((e) => claves.includes(e.evento))
  if (hay(['clicks'])) return { texto: 'Abrió el enlace del correo del boleto.', tono: 'ok' }
  if (hay(['opened', 'loadedByProxy'])) return { texto: 'Abrió el correo del boleto (el PDF va adjunto).', tono: 'ok' }
  if (hay(['delivered'])) return { texto: 'El correo del boleto le llegó, pero no lo ha abierto.', tono: 'neutro' }
  const falla = delBoleto.find((e) => FALLAS.includes(e.evento))
  if (falla) {
    return {
      texto: `El correo no le llegó (${EVENTOS[falla.evento]?.texto ?? falla.evento}). Reenvía a otro correo o imprime su etiqueta.`,
      tono: 'mal',
    }
  }
  if (hay(['requests', 'deferred'])) return { texto: 'Enviado; Brevo aún no confirma la entrega.', tono: 'neutro' }
  if (f.correos.total > 0) return { texto: `Se le envió el boleto ${veces(f.correos.total)}.`, tono: 'neutro' }
  if (!f.confirmado) return { texto: 'No confirmó su correo: nunca recibió el boleto digital.', tono: 'mal' }
  if (eventos == null) return { texto: 'Consultando el estado del correo…', tono: 'neutro' }
  return { texto: 'Sin envíos del boleto en los últimos 90 días.', tono: 'neutro' }
}

function resumenPuerta(f: Ficha): { texto: string; tono: Tono } {
  const e = f.escaneos
  if (e.entradas > 0) {
    const primera = fechaHora(e.primeraEntrada)
    return { texto: `Ya entró ${veces(e.entradas)}${primera ? ` · primera ${primera}` : ''}.`, tono: 'ok' }
  }
  if (e.rechazos > 0) return { texto: `La puerta lo rechazó ${veces(e.rechazos)}; aún no entra.`, tono: 'mal' }
  return { texto: 'Aún no pasa por la puerta.', tono: 'neutro' }
}

const claseTono = (t: Tono) => (t === 'ok' ? styles.tonoOk : t === 'mal' ? styles.tonoMal : styles.tonoNeutro)

export default function FichaPersona({ tipo, id, sesion, version, ocupado, onImprimir, onCambio, onClose }: Props) {
  const tituloId = useId()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [eventos, setEventos] = useState<EventoCorreo[] | null>(null)
  const [eventosError, setEventosError] = useState<string | null>(null)
  const [otroCorreo, setOtroCorreo] = useState('')
  const [mostrarOtro, setMostrarOtro] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; tono: Tono } | null>(null)
  const verCorreos = tiene(sesion, 'buscar')

  const cargar = useCallback(async () => {
    try {
      setFicha(await mesa.ficha(tipo, id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la ficha')
    }
  }, [tipo, id])

  const cargarEventos = useCallback(async () => {
    setEventosError(null)
    try {
      const r = await mesa.correoEventos(tipo, id)
      setEventos(r.eventos ?? [])
      if (!r.ok) setEventosError(r.mensaje || r.error || 'No se pudo consultar Brevo')
    } catch (e) {
      setEventos([])
      setEventosError(e instanceof Error ? e.message : 'No se pudo consultar Brevo')
    }
  }, [tipo, id])

  useEffect(() => {
    void cargar()
  }, [cargar, version])

  useEffect(() => {
    if (verCorreos) void cargarEventos()
  }, [cargarEventos, verCorreos])

  // Esc cierra la ficha, salvo que encima esté abierto el preview de impresión (lo cierra él).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[data-boleto-print-root]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const reenviar = async (destino?: string) => {
    setEnviando(true)
    setAviso(null)
    try {
      const r = await mesa.reenviar(tipo, id, destino)
      if (r.ok) {
        setAviso({ texto: `Boleto enviado a ${r.correo}.`, tono: 'ok' })
        setOtroCorreo('')
        setMostrarOtro(false)
        void cargar()
        onCambio?.()
        // Brevo tarda unos segundos en reportar "Entregado".
        window.setTimeout(() => void cargarEventos(), 5000)
      } else {
        setAviso({ texto: r.mensaje || r.error || 'No se pudo enviar el boleto.', tono: 'mal' })
      }
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : 'No se pudo enviar el boleto.', tono: 'mal' })
    } finally {
      setEnviando(false)
    }
  }

  const confirmar = async () => {
    setConfirmando(true)
    setAviso(null)
    try {
      const r = await mesa.confirmar(tipo, id)
      if (!r.ok) throw new Error(r.error || 'No se pudo confirmar')
      setAviso({ texto: 'Confirmado: su QR ya pasa en la puerta.', tono: 'ok' })
      void cargar()
      onCambio?.()
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : 'No se pudo confirmar', tono: 'mal' })
    } finally {
      setConfirmando(false)
    }
  }

  const boleto = ficha ? resumenBoleto(ficha, verCorreos ? eventos : []) : null
  const puerta = ficha ? resumenPuerta(ficha) : null
  const eventosOrdenados = [...(eventos ?? [])].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))

  return (
    <div className={styles.capa} role="presentation" onClick={onClose}>
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.cab}>
          <div className={styles.cabTexto}>
            <p className={styles.kicker}>
              {ficha ? `${ficha.tipoEtiqueta} · ${ficha.folio}` : 'Ficha de la persona'}
            </p>
            <h2 id={tituloId}>{ficha?.nombre ?? (error ? 'Sin datos' : 'Cargando…')}</h2>
            {ficha ? (
              <div className={styles.badges}>
                {ficha.confirmado ? (
                  <span className={styles.badgeOk}>Confirmado</span>
                ) : (
                  <span className={styles.badgePend}>Sin confirmar</span>
                )}
                {ficha.escaneos.entradas > 0 ? <span className={styles.badgeOk}>Ya escaneado</span> : null}
                {ficha.impresiones.total > 0 ? (
                  <span className={styles.badgeRojo}>Etiqueta impresa ×{ficha.impresiones.total}</span>
                ) : null}
                {ficha.alta ? <span className={styles.badge}>Alta en sitio</span> : null}
              </div>
            ) : null}
          </div>
          <button type="button" className={styles.cerrar} onClick={onClose} aria-label="Cerrar ficha">
            ✕
          </button>
        </header>

        {error ? <div className={styles.alerta}>{error}</div> : null}

        {ficha ? (
          <div className={styles.cuerpo}>
            <section className={styles.acciones}>
              {ficha.puede.imprimir ? (
                <button
                  type="button"
                  className={styles.primario}
                  disabled={ocupado}
                  onClick={() =>
                    onImprimir({ impresiones: ficha.impresiones.total, ultimaImpresion: ficha.impresiones.ultima })
                  }
                >
                  {ocupado ? 'Preparando…' : 'Imprimir etiqueta (QR + nombre)'}
                </button>
              ) : null}
              {ficha.puede.reenviar ? (
                <>
                  <button
                    type="button"
                    className={styles.secundario}
                    disabled={enviando || !ficha.correo}
                    onClick={() => void reenviar()}
                  >
                    {enviando && !mostrarOtro ? 'Enviando…' : `Reenviar boleto a ${ficha.correo || 'su correo'}`}
                  </button>
                  <button type="button" className={styles.enlace} onClick={() => setMostrarOtro((v) => !v)}>
                    {mostrarOtro ? 'Cancelar' : 'Enviar a otro correo'}
                  </button>
                  {mostrarOtro ? (
                    <form
                      className={styles.otro}
                      onSubmit={(e) => {
                        e.preventDefault()
                        void reenviar(otroCorreo.trim())
                      }}
                    >
                      <input
                        type="email"
                        value={otroCorreo}
                        onChange={(e) => setOtroCorreo(e.target.value)}
                        placeholder="otro@correo.com"
                        aria-label="Otro correo"
                        autoFocus
                      />
                      <button type="submit" className={styles.secundario} disabled={enviando || !otroCorreo.trim()}>
                        {enviando ? 'Enviando…' : 'Enviar'}
                      </button>
                    </form>
                  ) : null}
                </>
              ) : null}
              {!ficha.confirmado && ficha.puede.confirmar ? (
                <button
                  type="button"
                  className={styles.secundario}
                  disabled={confirmando}
                  onClick={() => void confirmar()}
                >
                  {confirmando ? 'Confirmando…' : 'Confirmar (validado en persona)'}
                </button>
              ) : null}
              {aviso ? <p className={claseTono(aviso.tono)}>{aviso.texto}</p> : null}
            </section>

            <section className={styles.estado}>
              {boleto ? (
                <div>
                  <span>Boleto digital</span>
                  <strong className={claseTono(boleto.tono)}>{boleto.texto}</strong>
                </div>
              ) : null}
              {puerta ? (
                <div>
                  <span>Puerta</span>
                  <strong className={claseTono(puerta.tono)}>{puerta.texto}</strong>
                </div>
              ) : null}
            </section>

            <Seccion titulo="Correos del boleto">
              {ficha.correos.lista.length ? (
                <ul className={styles.lista}>
                  {ficha.correos.lista.map((c) => (
                    <li key={c.id}>
                      <time>{fechaHora(c.creado)}</time>
                      <span>
                        {MOTIVOS[c.motivo] ?? c.motivo} → {c.correo}
                        {c.operador ? ` · ${c.operador}` : ''}
                      </span>
                      <b className={c.ok ? styles.tonoOk : styles.tonoMal}>{c.ok ? 'Aceptado' : c.error || 'Falló'}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.vacio}>
                  Sin envíos registrados desde el panel (los anteriores a hoy solo aparecen en Brevo, abajo).
                </p>
              )}
              <p className={styles.nota}>
                Descargas del PDF desde el correo: <b>{ficha.descargas.total}</b>
                {ficha.descargas.ultima ? ` · última ${fechaHora(ficha.descargas.ultima)}` : ''}
              </p>
              {verCorreos ? (
                <>
                  <div className={styles.subcab}>
                    <h4>Entregas según Brevo (90 días)</h4>
                    <button type="button" className={styles.enlace} onClick={() => void cargarEventos()}>
                      Actualizar
                    </button>
                  </div>
                  {eventosError ? <p className={styles.tonoMal}>{eventosError}</p> : null}
                  {eventos == null ? (
                    <p className={styles.vacio}>Consultando Brevo…</p>
                  ) : eventosOrdenados.length ? (
                    <ul className={styles.lista}>
                      {eventosOrdenados.slice(0, 40).map((e, i) => (
                        <li key={`${e.messageId}-${e.evento}-${i}`}>
                          <time>{fechaHora(e.fecha)}</time>
                          <span>
                            {e.asunto || 'Sin asunto'} · {e.correo}
                            {e.motivo ? ` · ${e.motivo}` : ''}
                          </span>
                          <b className={claseTono(EVENTOS[e.evento]?.tono ?? 'neutro')}>
                            {EVENTOS[e.evento]?.texto ?? e.evento}
                          </b>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.vacio}>Brevo no tiene correos a esta dirección en los últimos 90 días.</p>
                  )}
                </>
              ) : null}
            </Seccion>

            <Seccion titulo="Accesos en puerta">
              <p className={styles.nota}>
                Entradas <b>{ficha.escaneos.entradas}</b> · Salidas <b>{ficha.escaneos.salidas}</b> · Rechazos{' '}
                <b>{ficha.escaneos.rechazos}</b>
              </p>
              {ficha.escaneos.lista.length ? (
                <ul className={styles.lista}>
                  {ficha.escaneos.lista.map((s) => (
                    <li key={s.id}>
                      <time>{fechaHora(s.creado)}</time>
                      <span>
                        {s.modo === 'entrada' ? 'Entrada' : s.modo === 'salida' ? 'Salida' : s.modo}
                        {s.zona_clave ? ` · ${s.zona_clave}` : ''}
                        {s.mensaje ? ` · ${s.mensaje}` : ''}
                      </span>
                      <b className={s.ok ? styles.tonoOk : styles.tonoMal}>{s.ok ? 'OK' : 'Rechazado'}</b>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Seccion>

            <Seccion titulo="Etiquetas impresas">
              {ficha.impresiones.lista.length ? (
                <ul className={styles.lista}>
                  {ficha.impresiones.lista.map((p) => (
                    <li key={p.id}>
                      <time>{fechaHora(p.creado)}</time>
                      <span>
                        {VIAS[p.via] ?? p.via}
                        {p.operador ? ` · ${p.operador}` : ''}
                        {p.dispositivo ? ` · ${p.dispositivo}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.vacio}>Aún no se le imprime etiqueta.</p>
              )}
            </Seccion>

            <Seccion titulo="Datos del registro">
              <dl className={styles.datos}>
                {ficha.campos.map((c) => (
                  <div key={c.clave}>
                    <dt>{c.etiqueta}</dt>
                    <dd>{c.clave === 'FechaRegistro' ? fechaHora(c.valor) ?? c.valor : c.valor}</dd>
                  </div>
                ))}
                {ficha.alta ? (
                  <div>
                    <dt>Alta en sitio</dt>
                    <dd>
                      {ficha.alta.operador}
                      {ficha.alta.creado ? ` · ${fechaHora(ficha.alta.creado)}` : ''}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Seccion>
          </div>
        ) : !error ? (
          <p className={styles.cargando}>Cargando ficha…</p>
        ) : null}
      </aside>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className={styles.seccion}>
      <h3>{titulo}</h3>
      {children}
    </section>
  )
}
