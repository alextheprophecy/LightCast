export { createLightcast } from './scene'
export {
  estimateGBuffer,
  packGBuffer,
  unpackGBuffer,
  DEFAULT_MODEL,
  type GBufferOptions,
} from './gbuffer'
export { loadImage, fitWithin, type LoadedImage } from './loader'
export {
  delightGrade,
  albedoToRgba,
  boxBlur,
  luminance,
  srgbToLinear,
  linearToSrgb,
  type DelightResult,
} from './delight'
export { kelvinToRgb, hexToRgb, lightDirection } from './color'
export { RelightRenderer, type LightUniforms } from './gl/renderer'

export type {
  LightScene,
  LightcastOptions,
  Light,
  LightPreset,
  ImageSource,
  GBufferSource,
  GBuffer,
  Device,
  Quality,
  Delight,
  ControlMode,
  ProgressStage,
  ExportOptions,
} from './types'

import { loadImage as _loadImage } from './loader'
import { estimateGBuffer as _estimate, packGBuffer as _pack } from './gbuffer'
import type { ImageSource, LightcastOptions } from './types'

/**
 * Bake a G-buffer offline (precompute workflow). Returns a PNG-ready ImageData
 * with normals in RGB and depth in alpha — ship it instead of the model.
 */
export async function bakeGBuffer(
  input: ImageSource,
  options: Pick<
    LightcastOptions,
    'model' | 'device' | 'quality' | 'maxResolution' | 'onProgress'
  > = {},
): Promise<ImageData> {
  const loaded = await _loadImage(input, options.maxResolution ?? 1024)
  const g = await _estimate(loaded.imageData.data, loaded.width, loaded.height, {
    model: options.model,
    device: options.device,
    quality: options.quality,
    onModelProgress: (p) => options.onProgress?.('model', p),
    onInference: (p) => options.onProgress?.('inference', p),
  })
  return _pack(g.normals, g.depth, g.width, g.height)
}
