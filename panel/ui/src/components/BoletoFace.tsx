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
export function textoNombre(data: BoletoData): string {
  return (data.nombre || '—').trim().toUpperCase()
}

export function textoSub(data: BoletoData): string {
  return (data.subtitulo || '').trim().toUpperCase()
}

/** Tamaño (mm) del nombre: la misma cuenta en el DOM y en el PNG. */
export function tamanosBoleto(data: BoletoData): { nombreMm: number } {
  return {
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
 * QR a la izquierda; a la derecha nombre, subtítulo y folio. Sin la banda roja
 * del tipo (retirada el 09-09-2026: el tipo ya viaja en el folio).
 * Misma geometría que renderBoletoPngBase64: lo que se ve es lo que sale.
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

  const { nombreMm } = useMemo(() => tamanosBoleto(data), [data, fuentesTick])
  const sub = textoSub(data)

  return (
    <article className={className} data-boleto-face>
      <div className="boletoQrWrap">
        <img className="boletoQr" src={data.qrDataUrl} alt={`QR ${data.folio}`} />
      </div>

      <div className="boletoTexto">
        <h1 className="boletoNombre" style={{ fontSize: `${nombreMm}mm` }}>
          {textoNombre(data)}
        </h1>
        {sub ? <p className="boletoSub">{sub}</p> : null}
        <p className="boletoFolio">{data.folio}</p>
      </div>
    </article>
  )
}
