import { useEffect, useMemo, useState } from 'react'
import { COL_W, GEO, ajustarFuenteMm, fuentesListas } from '../lib/boletoLayout'

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

/** Textos tal como se imprimen (mayúsculas y respaldos): los usan el DOM y el PNG. */
export function textoTipo(data: BoletoData): string {
  return (data.tipo || 'Acreditación').trim().toUpperCase()
}

export function textoNombre(data: BoletoData): string {
  return (data.nombre || '—').trim().toUpperCase()
}

export function textoSub(data: BoletoData): string {
  return (data.subtitulo || '').trim().toUpperCase()
}

/** Tamaños (mm) del tipo y del nombre: la misma cuenta en el DOM y en el PNG. */
export function tamanosBoleto(data: BoletoData): { tipoMm: number; nombreMm: number } {
  return {
    tipoMm: ajustarFuenteMm({
      texto: textoTipo(data),
      peso: 800,
      trackingEm: GEO.tipoTracking,
      anchoMm: COL_W - 2 * GEO.tipoPadX,
      maxLineas: 1,
      maxMm: GEO.tipoMax,
      minMm: GEO.tipoMin,
    }),
    nombreMm: ajustarFuenteMm({
      texto: textoNombre(data),
      peso: 800,
      trackingEm: GEO.nombreTracking,
      anchoMm: COL_W,
      maxLineas: GEO.nombreLineas,
      maxMm: GEO.nombreMax,
      minMm: GEO.nombreMin,
    }),
  }
}

/**
 * Cara del boleto QL-800, apaisada 94 × 59 mm (papel térmico negro/rojo):
 * QR a la izquierda; a la derecha banda roja con el tipo, nombre, subtítulo y
 * folio. Misma geometría que renderBoletoPngBase64: lo que se ve es lo que sale.
 */
export default function BoletoFace({ data, className }: Props) {
  // Las fuentes web pueden llegar después del primer render: se vuelve a medir.
  const [fuentesTick, setFuentesTick] = useState(0)
  useEffect(() => {
    let vivo = true
    void fuentesListas().then(() => {
      if (vivo) setFuentesTick((t) => t + 1)
    })
    return () => {
      vivo = false
    }
  }, [])

  const { tipoMm, nombreMm } = useMemo(() => tamanosBoleto(data), [data, fuentesTick])
  const sub = textoSub(data)

  return (
    <article className={className} data-boleto-face>
      <div className="boletoQrWrap">
        <img className="boletoQr" src={data.qrDataUrl} alt={`QR ${data.folio}`} />
      </div>

      <div className="boletoTexto">
        <p className="boletoTipo" style={{ fontSize: `${tipoMm}mm` }}>
          {textoTipo(data)}
        </p>
        <h1 className="boletoNombre" style={{ fontSize: `${nombreMm}mm` }}>
          {textoNombre(data)}
        </h1>
        {sub ? <p className="boletoSub">{sub}</p> : null}
        <p className="boletoFolio">{data.folio}</p>
      </div>
    </article>
  )
}
