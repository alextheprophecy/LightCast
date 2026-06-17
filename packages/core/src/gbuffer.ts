/**
 * Geometry-buffer estimation: a single image → surface normals + depth.
 *
 * Runs Metric3D v2 (community ONNX export) on `onnxruntime-web`, WebGPU→WASM.
 * Metric3D conveniently emits BOTH metric depth and surface normals in one
 * feed-forward pass, so a single session fills the whole G-buffer.
 *
 * NOTE: model I/O is isolated here behind `estimateGBuffer` so the renderer and
 * scene never touch onnxruntime directly, and so the model can be swapped.
 */
import type { Device, GBuffer, Quality } from './types'

export const DEFAULT_MODEL = 'onnx-community/metric3d-vit-small'

const DTYPE_BY_QUALITY: Record<Quality, 'q8' | 'fp16' | 'fp32'> = {
  low: 'q8',
  medium: 'fp16',
  high: 'fp32',
}

export interface GBufferOptions {
  model?: string
  device?: Device
  quality?: Quality
  onModelProgress?: (pct: number) => void
  onInference?: (pct: number) => void
}

/** Pack float normals (-1..1) + depth (0..1) into an RGBA ImageData (PNG-ready). */
export function packGBuffer(
  normals: Float32Array,
  depth: Float32Array,
  width: number,
  height: number,
): ImageData {
  const n = width * height
  const data = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    data[i * 4] = Math.round((normals[i * 3]! * 0.5 + 0.5) * 255)
    data[i * 4 + 1] = Math.round((normals[i * 3 + 1]! * 0.5 + 0.5) * 255)
    data[i * 4 + 2] = Math.round((normals[i * 3 + 2]! * 0.5 + 0.5) * 255)
    data[i * 4 + 3] = Math.round(depth[i]! * 255)
  }
  return new ImageData(data, width, height)
}

/** Unpack a baked G-buffer PNG (precompute workflow) back into float arrays. */
export function unpackGBuffer(packed: ImageData): GBuffer {
  const { width, height, data } = packed
  const n = width * height
  const normals = new Float32Array(n * 3)
  const depth = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    normals[i * 3] = (data[i * 4]! / 255) * 2 - 1
    normals[i * 3 + 1] = (data[i * 4 + 1]! / 255) * 2 - 1
    normals[i * 3 + 2] = (data[i * 4 + 2]! / 255) * 2 - 1
    depth[i] = data[i * 4 + 3]! / 255
  }
  return { packed, normals, depth, width, height }
}

/**
 * Estimate normals + depth from RGBA pixels.
 *
 * TODO(impl): create a cached `ort.InferenceSession` for `model` (WebGPU→WASM),
 * preprocess to the model's fixed input, run, then read the `normal` and `depth`
 * output tensors and resize to (width,height). Wiring is intentionally left to the
 * first implementation PR — see PLAN.md §4. The pack/unpack + control flow are real.
 */
export async function estimateGBuffer(
  _rgba: Uint8ClampedArray,
  _width: number,
  _height: number,
  _options: GBufferOptions = {},
): Promise<GBuffer> {
  throw new Error(
    'lightcast: estimateGBuffer is not wired yet. See PLAN.md §4 — load Metric3D v2 ONNX via ' +
      'onnxruntime-web and fill normals+depth. Use packGBuffer()/unpackGBuffer() for the buffer.',
  )
}
