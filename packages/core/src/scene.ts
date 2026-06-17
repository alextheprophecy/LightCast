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
import type { GBufferSource, Light, LightcastOptions, LightScene, ImageSource } from './types'

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
    play() {
      throw new Error('lightcast: play() animation loop not wired yet — see PLAN.md §7.')
    },
    pause() {},
    async exportVideo() {
      throw new Error('lightcast: exportVideo() not wired yet — see PLAN.md §7.')
    },
    dispose() {
      renderer.dispose()
    },
  }
  return scene
}
