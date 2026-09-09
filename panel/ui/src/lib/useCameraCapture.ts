import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import jsQR from 'jsqr'

type DetectedCode = { rawValue: string }
type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<DetectedCode[]>
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike
type BarcodeDetectorStatic = BarcodeDetectorCtor & {
  getSupportedFormats?: () => Promise<string[]>
}

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'running'
  | 'denied'
  | 'unsupported'
  | 'error'

export type DecoderKind = 'nativo' | 'jsqr'

/**
 * Fraccion del cuadro que ocupa el marco verde en pantalla (camera-scan.module.scss
 * usa inset 18%, o sea 64%). Decodificamos primero ese recorte: el QR ocupa mas
 * pixeles utiles y no leemos codigos del fondo.
 */
const ROI_FRACTION = 0.72
/** Lado maximo del lienzo que ve el decodificador. Mas grande = mas lento, no mas preciso. */
const MAX_DECODE_SIDE = 640
/** Cada N intentos miramos el cuadro completo, por si el QR quedo fuera del marco. */
const FULL_FRAME_EVERY = 4
/** Mismo codigo repetido dentro de esta ventana = ignorado (la camara lee en continuo). */
const REPEAT_WINDOW_MS = 2000
/** Si BarcodeDetector revienta seguido (WebViews Android), nos pasamos a jsQR y no volvemos. */
const DETECTOR_FAILURE_LIMIT = 5
/** Respiro entre intentos cuando el navegador no expone requestVideoFrameCallback. */
const FALLBACK_INTERVAL_MS = 80

type VideoFrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean }
type TorchConstraint = { torch?: boolean; focusMode?: string }

function detectorCtor(): BarcodeDetectorStatic | null {
  if (typeof window === 'undefined') return null
  return (
    (window as unknown as { BarcodeDetector?: BarcodeDetectorStatic }).BarcodeDetector ?? null
  )
}

function cameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

/** Recorte centrado del cuadro, del tamano del marco verde. */
function regionOfInterest(width: number, height: number) {
  const side = Math.round(Math.min(width, height) * ROI_FRACTION)
  return {
    x: Math.round((width - side) / 2),
    y: Math.round((height - side) / 2),
    w: side,
    h: side,
  }
}

export function useCameraCapture(options: {
  onDecode: (value: string) => void
  paused?: boolean
}): {
  videoRef: RefObject<HTMLVideoElement | null>
  status: CameraStatus
  error: string
  active: boolean
  decoderSupported: boolean
  decoder: DecoderKind
  torchAvailable: boolean
  torchOn: boolean
  toggleTorch: () => void
  canSwitchCamera: boolean
  switchCamera: () => void
  start: () => void
  stop: () => void
} {
  const { onDecode, paused = false } = options
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onDecodeRef = useRef(onDecode)
  const pausedRef = useRef(paused)
  const lastValueRef = useRef<{ value: string; at: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const deviceIdsRef = useRef<string[]>([])
  const deviceIndexRef = useRef(0)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState('')
  const [decoder, setDecoder] = useState<DecoderKind>('jsqr')
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [canSwitchCamera, setCanSwitchCamera] = useState(false)

  onDecodeRef.current = onDecode
  pausedRef.current = paused

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setActive(false)
    setStatus('idle')
    setTorchAvailable(false)
    setTorchOn(false)
  }, [])

  const openStream = useCallback(
    async (deviceId?: string) => {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: deviceId
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = stream

      const track = stream.getVideoTracks()[0]
      if (track) {
        // Enfoque continuo: sin esto la camara del portatil se queda fija al infinito
        // y un boleto a 20 cm nunca entra en foco.
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as TorchConstraint],
          } as MediaTrackConstraints)
        } catch {
          /* el dispositivo no deja fijar enfoque: seguimos igual */
        }
        const caps = (track.getCapabilities?.() ?? {}) as TorchCapabilities
        setTorchAvailable(Boolean(caps.torch))
        setTorchOn(false)
      }

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        await video.play()
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const cams = devices.filter((d) => d.kind === 'videoinput')
        deviceIdsRef.current = cams.map((d) => d.deviceId).filter(Boolean)
        setCanSwitchCamera(deviceIdsRef.current.length > 1)
        if (deviceId) {
          const idx = deviceIdsRef.current.indexOf(deviceId)
          if (idx >= 0) deviceIndexRef.current = idx
        } else {
          const current = track?.getSettings?.().deviceId
          const idx = current ? deviceIdsRef.current.indexOf(current) : -1
          deviceIndexRef.current = idx >= 0 ? idx : 0
        }
      } catch {
        setCanSwitchCamera(false)
      }
    },
    [],
  )

  const start = useCallback(() => {
    if (!cameraSupported()) {
      setStatus('unsupported')
      setError(
        typeof window !== 'undefined' && !window.isSecureContext
          ? 'La camara exige HTTPS. Abre el panel por https y reintenta, o usa el lector USB.'
          : 'Este dispositivo no expone camara.',
      )
      return
    }
    setStatus('requesting')
    setError('')
    void (async () => {
      try {
        await openStream()
        setActive(true)
        setStatus('running')
      } catch (cause) {
        const name = cause instanceof DOMException ? cause.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied')
          setError('Permiso de camara denegado. Usa el lector USB.')
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setStatus('unsupported')
          setError('No se encontro ninguna camara conectada.')
        } else if (name === 'NotReadableError') {
          setStatus('error')
          setError('Otra aplicacion esta usando la camara. Cierrala y reintenta.')
        } else {
          setStatus('error')
          setError(cause instanceof Error ? cause.message : 'No se pudo abrir la camara')
        }
        stop()
      }
    })()
  }, [openStream, stop])

  const switchCamera = useCallback(() => {
    const ids = deviceIdsRef.current
    if (ids.length < 2) return
    const next = (deviceIndexRef.current + 1) % ids.length
    deviceIndexRef.current = next
    void (async () => {
      try {
        await openStream(ids[next])
        setStatus('running')
      } catch {
        setError('No se pudo cambiar de camara.')
      }
    })()
  }, [openStream])

  const toggleTorch = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    void (async () => {
      try {
        await track.applyConstraints({
          advanced: [{ torch: next } as TorchConstraint],
        } as MediaTrackConstraints)
        setTorchOn(next)
      } catch {
        setTorchAvailable(false)
      }
    })()
  }, [torchOn])

  useEffect(() => {
    if (!active || status !== 'running') return

    let cancelled = false
    let inFlight = false
    let attempt = 0
    let detectorFailures = 0
    let detector: BarcodeDetectorLike | null = null
    let frameHandle = 0
    let timerId = 0

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas')

    void (async () => {
      const Ctor = detectorCtor()
      if (!Ctor) {
        setDecoder('jsqr')
        return
      }
      try {
        const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code']
        if (!formats.includes('qr_code')) {
          setDecoder('jsqr')
          return
        }
        detector = new Ctor({ formats: ['qr_code'] })
        if (!cancelled) setDecoder('nativo')
      } catch {
        detector = null
        if (!cancelled) setDecoder('jsqr')
      }
    })()

    const emit = (raw: string) => {
      const now = Date.now()
      const last = lastValueRef.current
      if (last && last.value === raw && now - last.at < REPEAT_WINDOW_MS) return
      lastValueRef.current = { value: raw, at: now }
      onDecodeRef.current(raw)
    }

    /** Dibuja el recorte pedido conservando la proporcion (deformarlo rompe el QR). */
    const paint = (
      video: HTMLVideoElement,
      region: { x: number; y: number; w: number; h: number },
    ): ImageData | null => {
      const canvas = canvasRef.current
      if (!canvas || region.w < 8 || region.h < 8) return null
      const scale = Math.min(1, MAX_DECODE_SIDE / Math.max(region.w, region.h))
      const cw = Math.max(8, Math.round(region.w * scale))
      const ch = Math.max(8, Math.round(region.h * scale))
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(video, region.x, region.y, region.w, region.h, 0, 0, cw, ch)
      return ctx.getImageData(0, 0, cw, ch)
    }

    const decodeOnce = async (): Promise<void> => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      const vw = video.videoWidth
      const vh = video.videoHeight
      if (!vw || !vh) return

      attempt += 1
      const wholeFrame = attempt % FULL_FRAME_EVERY === 0
      const region = wholeFrame
        ? { x: 0, y: 0, w: vw, h: vh }
        : regionOfInterest(vw, vh)

      if (detector) {
        try {
          const canvas = canvasRef.current
          const painted = paint(video, region)
          const source: CanvasImageSource = painted && canvas ? canvas : video
          const codes = await detector.detect(source)
          const raw = codes[0]?.rawValue?.trim()
          detectorFailures = 0
          if (raw) emit(raw)
          return
        } catch {
          detectorFailures += 1
          if (detectorFailures >= DETECTOR_FAILURE_LIMIT) {
            detector = null
            setDecoder('jsqr')
          }
          return
        }
      }

      const img = paint(video, region)
      if (!img) return
      // Alternamos la inversion: una etiqueta gastada o fotografiada a contraluz
      // solo decodifica probando ambos sentidos, pero probarlo siempre cuesta el doble.
      const code = jsQR(img.data, img.width, img.height, {
        inversionAttempts: wholeFrame ? 'attemptBoth' : 'dontInvert',
      })
      const raw = code?.data?.trim()
      if (raw) emit(raw)
    }

    const video = videoRef.current as VideoFrameCallbackVideo | null
    const useFrameCallback = Boolean(video?.requestVideoFrameCallback)

    const schedule = () => {
      if (cancelled) return
      if (useFrameCallback && video?.requestVideoFrameCallback) {
        frameHandle = video.requestVideoFrameCallback(() => void pump())
      } else {
        timerId = window.setTimeout(() => void pump(), FALLBACK_INTERVAL_MS)
      }
    }

    /** Un intento a la vez: si un cuadro tarda, no se apilan decodificaciones. */
    const pump = async () => {
      if (cancelled) return
      if (inFlight) {
        schedule()
        return
      }
      inFlight = true
      try {
        if (!pausedRef.current && document.visibilityState !== 'hidden') {
          await decodeOnce()
        }
      } catch {
        /* cuadro perdido: seguimos con el siguiente */
      } finally {
        inFlight = false
      }
      schedule()
    }

    void pump()

    return () => {
      cancelled = true
      if (timerId) window.clearTimeout(timerId)
      if (frameHandle && video?.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameHandle)
      }
    }
  }, [active, status])

  // El sistema puede cortar el stream al bloquear la pantalla o cambiar de app:
  // al volver, si la pista murio, reabrimos en vez de dejar un visor congelado.
  useEffect(() => {
    if (!active) return
    const revisar = () => {
      if (document.visibilityState !== 'visible') return
      const track = streamRef.current?.getVideoTracks()[0]
      if (!track || track.readyState === 'ended') {
        void (async () => {
          try {
            await openStream(deviceIdsRef.current[deviceIndexRef.current])
            setStatus('running')
          } catch {
            setStatus('error')
            setError('Se perdio la camara. Cierrala y vuelve a abrirla.')
          }
        })()
      }
    }
    document.addEventListener('visibilitychange', revisar)
    return () => document.removeEventListener('visibilitychange', revisar)
  }, [active, openStream])

  useEffect(() => () => stop(), [stop])

  return {
    videoRef,
    status,
    error,
    active,
    decoderSupported: true,
    decoder,
    torchAvailable,
    torchOn,
    toggleTorch,
    canSwitchCamera,
    switchCamera,
    start,
    stop,
  }
}
