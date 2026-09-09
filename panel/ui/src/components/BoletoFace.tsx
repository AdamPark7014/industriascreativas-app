export type BoletoData = {
  nombre: string
  folio: string
  tipo: string
  subtitulo: string
  evento: string
  formato: string
  qrDataUrl: string
  acento: string
}

type Props = {
  data: BoletoData
  /** Clase extra (p. ej. en modal vs hoja de impresión). */
  className?: string
}

/** Texto de marca en la banda superior (los logos son claros: no sirven en térmico). */
export const BOLETO_MARCA = 'FICTI · TECH CAPITAL'

/** Rojo del rollo DK-2251; se ignora `data.acento` porque el térmico solo tiene negro/rojo. */
export const BOLETO_ROJO = '#e60012'

/**
 * Cara del boleto QL-800 (59×94 mm, papel térmico negro/rojo).
 * Misma geometría que renderBoletoPngBase64: lo que se ve es lo que sale.
 */
export default function BoletoFace({ data, className }: Props) {
  return (
    <article
      className={className}
      style={{ ['--boleto-acento' as string]: BOLETO_ROJO }}
      data-boleto-face
    >
      <header className="boletoBrand">{BOLETO_MARCA}</header>

      <p className="boletoTipo">{data.tipo || 'Acreditación'}</p>

      <h1 className="boletoNombre">{data.nombre || '—'}</h1>
      {data.subtitulo ? <p className="boletoSub">{data.subtitulo}</p> : null}
      <p className="boletoEvento">{data.evento || 'FICTI · Tech Capital 2026'}</p>

      <div className="boletoQrWrap">
        <img className="boletoQr" src={data.qrDataUrl} alt={`QR ${data.folio}`} />
      </div>

      <footer className="boletoPie">
        <span>Presenta este código en puerta</span>
        <strong>{data.folio}</strong>
      </footer>
    </article>
  )
}
