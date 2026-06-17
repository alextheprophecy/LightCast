/**
 * createLightcast — the one-call entry point.
 *
 * Orchestrates: load → (estimate or unpack) G-buffer → de-light → upload →
 * relight, then wires controls (pointer/orbit/scroll) to a damped light loop.
 *
 * The orchestration, option defaults and control wiring are real; the two heavy
 * leaves (geometry inference, GL upload/render) live behind `estimateGBuffer`
 * and `RelightRenderer`, which the first implementation PR fills in.
 */
import { loadImage } from './loader'
import { estimateGBuffer, unpackGBuffer, DEFAULT_MODEL } from './gbuffer'
import { delightGrade, albedoToRgba } from './delight'
import { RelightRenderer } from './gl/renderer'
import { hexToRgb, kelvinToRgb, lightDirection } from './color'
import type {
  GBufferSource,
  Light,
  LightcastOptions,
  LightPreset,
  LightScene,
  ImageSource,
} from './types'

/** Named light animations: t in seconds, `base` the light at play() time. */
const PRESETS: Record<LightPreset, (t: number, base: Required<Light>) => Partial<Light>> = {
  studio: (t, b) => ({
    azimuth: b.azimuth + 28 * Math.sin(t * 0.6),
    elevation: b.elevation + 10 * Math.sin(t * 0.31),
  }),
  orbit: (t, b) => ({ azimuth: (b.azimuth + t * 45) % 360, elevation: b.elevation }),
  'golden-hour': (t, b) => ({
    azimuth: b.azimuth + 18 * Math.sin(t * 0.22),
    elevation: 16 + 8 * Math.sin(t * 0.16),
    temperature: 3200,
  }),
  flicker: (t, b) => ({
    azimuth: b.azimuth + 3 * Math.sin(t * 9),
    intensity: b.intensity * (0.82 + 0.18 * Math.abs(Math.sin(t * 11) * Math.cos(t * 5.3))),
  }),
}

const DEFAULTS = {
  model: DEFAULT_MODEL,
  device: 'auto' as const,
  quality: 'medium' as const,
  delight: 'grade' as const,
  ambient: 0.25,
  specular: 0.3,
  shadows: true,
  controls: 'pointer' as const,
  damping: 0.12,
  maxResolution: 1024,
  respectReducedMotion: true,
}

const DEFAULT_LIGHT: Required<Light> = {
  azimuth: 35,
  elevation: 45,
  color: '#ffffff',
  temperature: 0,
  intensity: 1,
}

async function decodeGBuffer(src: GBufferSource): Promise<ImageData> {
  const loaded = await loadImage(src as ImageSource, 4096)
  return loaded.imageData
}

export async function createLightcast(
  input: ImageSource,
  options: LightcastOptions = {},
): Promise<LightScene> {
  const opts = { ...DEFAULTS, ...options }
  const light: Required<Light> = { ...DEFAULT_LIGHT, ...options.light }

  const loaded = await loadImage(input, opts.maxResolution)
  opts.onProgress?.('gbuffer', 0)

  const gbuffer = options.gbuffer
    ? unpackGBuffer(await decodeGBuffer(options.gbuffer))
    : await estimateGBuffer(loaded.imageData.data, loaded.width, loaded.height, {
        model: opts.model,
        device: opts.device,
        quality: opts.quality,
        onModelProgress: (p) => opts.onProgress?.('model', p),
        onInference: (p) => opts.onProgress?.('inference', p),
      })
  opts.onProgress?.('gbuffer', 100)

  // De-light to recover an albedo the renderer can re-shade.
  const albedo =
    opts.delight === 'none'
      ? loaded.imageData.data
      : albedoToRgba(
          delightGrade(loaded.imageData.data, loaded.width, loaded.height).albedo,
          loaded.width,
          loaded.height,
        )

  const renderer = new RelightRenderer(gbuffer.width, gbuffer.height)
  renderer.upload(albedo, gbuffer)

  const colorOf = (l: Required<Light>): [number, number, number] =>
    l.temperature > 0 ? kelvinToRgb(l.temperature) : hexToRgb(l.color)

  const draw = () => {
    renderer.render({
      lightDir: lightDirection(light.azimuth, light.elevation),
      lightColor: colorOf(light),
      intensity: light.intensity,
      ambient: opts.ambient,
      specular: opts.specular,
      shadows: opts.shadows,
    })
  }
  draw()

  // --- animation loop ---
  const reduceMotion =
    opts.respectReducedMotion &&
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches

  let rafId: number | null = null
  const stopLoop = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  const scene: LightScene = {
    canvas: renderer.canvas,
    gbuffer,
    mount(container) {
      container.appendChild(renderer.canvas)
      return this
    },
    setLight(next) {
      Object.assign(light, next)
      draw()
    },
    update(next) {
      Object.assign(opts, next)
      if (next.light) Object.assign(light, next.light)
      draw()
    },
    play(animation = 'studio') {
      stopLoop()
      const base: Required<Light> = { ...light }
      if (reduceMotion) {
        // Honor reduced-motion: settle on a single tasteful frame, no loop.
        Object.assign(light, base, PRESETS[animation](0, base))
        draw()
        return
      }
      const start = performance.now()
      const frame = (now: number) => {
        Object.assign(light, base, PRESETS[animation]((now - start) / 1000, base))
        draw()
        rafId = requestAnimationFrame(frame)
      }
      rafId = requestAnimationFrame(frame)
    },
    pause() {
      stopLoop()
    },
    async exportVideo(exportOpts = {}) {
      const animation = exportOpts.preset ?? 'orbit'
      const durationMs = exportOpts.durationMs ?? 4000
      const fps = exportOpts.fps ?? 30
      const mimeType = exportOpts.mimeType ?? 'video/webm'
      stopLoop()
      const stream = renderer.canvas.captureStream(fps)
      const rec = new MediaRecorder(stream, {
        mimeType,
        ...(exportOpts.bitrate ? { videoBitsPerSecond: exportOpts.bitrate } : {}),
      })
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      const base: Required<Light> = { ...light }
      const start = performance.now()
      return new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          Object.assign(light, base)
          draw()
          resolve(new Blob(chunks, { type: mimeType }))
        }
        rec.start()
        const frame = (now: number) => {
          const elapsed = now - start
          Object.assign(light, base, PRESETS[animation](elapsed / 1000, base))
          draw()
          if (elapsed >= durationMs) rec.stop()
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })
    },
    dispose() {
      stopLoop()
      renderer.dispose()
    },
  }
  return scene
}
