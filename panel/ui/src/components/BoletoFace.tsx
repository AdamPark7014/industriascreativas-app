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

/** Cara del gafete 5×8 — pantalla y @media print. */
export default function BoletoFace({ data, className }: Props) {
  return (
    <article
      className={className}
      style={{ ['--boleto-acento' as string]: data.acento }}
      data-boleto-face
    >
      <div className="boletoCut" aria-hidden>
        <i data-c="tl" />
        <i data-c="tr" />
        <i data-c="bl" />
        <i data-c="br" />
      </div>

      <header className="boletoBrand">
        <img src="/static/img/ficti-logo.png" alt="FICTI" />
        <img src="/static/img/tech-capital-logo.png" alt="Tech Capital" />
      </header>

      <p className="boletoTipo">{data.tipo}</p>
      <hr className="boletoRule" />

      <h1 className="boletoNombre">{data.nombre}</h1>
      {data.subtitulo ? <p className="boletoSub">{data.subtitulo}</p> : null}
      <p className="boletoEvento">{data.evento}</p>

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
