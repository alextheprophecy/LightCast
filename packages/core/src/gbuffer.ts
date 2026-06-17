/**
 * Geometry-buffer estimation: a single image → surface normals + depth.
 *
 * We run a depth-estimation model (Depth Anything V2) via transformers.js
 * (WebGPU→WASM), then derive surface normals analytically from the depth
 * gradient. This keeps the model small and mobile-friendly — no separate
 * normals network — while still giving the relight renderer a full G-buffer.
 *
 * Model I/O is isolated here behind `estimateGBuffer` so the renderer and scene
 * never touch the inference runtime directly, and so the model can be swapped
 * (e.g. for a true normals model like Metric3D) without touching the renderer.
 */
import {
  pipeline,
  RawImage,
  type DepthEstimationPipeline,
  type ProgressCallback,
} from '@huggingface/transformers'
import { boxBlur } from './delight'
import type { Device, GBuffer, Quality } from './types'

export const DEFAULT_MODEL = 'onnx-community/depth-anything-v2-small'

const DTYPE_BY_QUALITY: Record<Quality, 'q8' | 'fp16' | 'fp32'> = {
  low: 'q8',
  medium: 'fp16',
  high: 'fp32',
}

export interface GBufferOptions {
  model?: string
  device?: Device
  quality?: Quality
  /** Bumpiness of the derived normals. Higher = more pronounced relief. Default 1. */
  normalStrength?: number
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

const pipelineCache = new Map<string, Promise<DepthEstimationPipeline>>()

/** Lazily create (and cache) a depth-estimation pipeline, webgpu→wasm fallback. */
async function getDepthPipeline(options: GBufferOptions): Promise<DepthEstimationPipeline> {
  const { model = DEFAULT_MODEL, device = 'auto', quality = 'medium', onModelProgress } = options
  const dtype = DTYPE_BY_QUALITY[quality]

  const progress_callback: ProgressCallback | undefined = onModelProgress
    ? (e: { status?: string; progress?: number }) => {
        if (e?.status === 'progress' && typeof e.progress === 'number') onModelProgress(e.progress)
        if (e?.status === 'ready' || e?.status === 'done') onModelProgress(100)
      }
    : undefined

  const order: Device[] = device === 'auto' ? ['webgpu', 'wasm'] : [device]

  let lastError: unknown
  for (const dev of order) {
    const key = `${model}::${dev}::${dtype}`
    let pending = pipelineCache.get(key)
    if (!pending) {
      pending = pipeline('depth-estimation', model, {
        device: dev === 'wasm' ? undefined : dev,
        dtype,
        progress_callback,
      }) as Promise<DepthEstimationPipeline>
      pipelineCache.set(key, pending)
    }
    try {
      return await pending
    } catch (err) {
      lastError = err
      pipelineCache.delete(key) // don't cache a failed init
    }
  }
  throw new Error(
    `lightcast: failed to initialize depth model "${model}". ` +
      `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

/** Normalize a raw depth tensor to 0..1 floats with near = 1. */
function normalizeDepth(raw: Float32Array): Float32Array {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i]!
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min || 1
  const out = new Float32Array(raw.length)
  // Depth Anything emits larger = closer, so a straight min-max keeps near ≈ 1.
  for (let i = 0; i < raw.length; i++) out[i] = (raw[i]! - min) / range
  return out
}

/** Bilinear resize of a single-channel float field to (dw, dh). */
function resizeFloat(
  src: Float32Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float32Array {
  if (sw === dw && sh === dh) return src
  const out = new Float32Array(dw * dh)
  const fx = sw / dw
  const fy = sh / dh
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * fy - 0.5))
    const y0 = Math.floor(sy)
    const y1 = Math.min(sh - 1, y0 + 1)
    const wy = sy - y0
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * fx - 0.5))
      const x0 = Math.floor(sx)
      const x1 = Math.min(sw - 1, x0 + 1)
      const wx = sx - x0
      const a = src[y0 * sw + x0]!
      const b = src[y0 * sw + x1]!
      const c = src[y1 * sw + x0]!
      const d = src[y1 * sw + x1]!
      const top = a + (b - a) * wx
      const bot = c + (d - c) * wx
      out[y * dw + x] = top + (bot - top) * wy
    }
  }
  return out
}

/** Separable max-filter (grayscale dilation) of a float field, radius `r`. */
function dilateMaxFloat(src: Float32Array, width: number, height: number, r: number): Float32Array {
  if (r < 1) return src.slice()
  const tmp = new Float32Array(src.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let m = 0
      for (let k = -r; k <= r; k++) {
        const xx = x + k
        if (xx >= 0 && xx < width) m = Math.max(m, src[row + xx]!)
      }
      tmp[row + x] = m
    }
  }
  const out = new Float32Array(src.length)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = 0
      for (let k = -r; k <= r; k++) {
        const yy = y + k
        if (yy >= 0 && yy < height) m = Math.max(m, tmp[yy * width + x]!)
      }
      out[y * width + x] = m
    }
  }
  return out
}

/**
 * Derive unit surface normals from a depth height-field. Output length n*3, -1..1.
 *
 * Object silhouettes are depth *cliffs*, not steep surfaces: differentiating
 * across them would tilt the normal sideways and paint a halo along every edge.
 * We build a per-pixel edge map (local depth jump) and **dilate** it, then use it
 * as a bilateral weight — so the whole silhouette transition band (a cliff is
 * smeared into a short ramp by depth resize/blur, and the ramp's shoulders would
 * otherwise survive) is held camera-facing, while genuine surface relief shades.
 */
export function normalsFromDepth(
  depth: Float32Array,
  width: number,
  height: number,
  strength: number,
): Float32Array {
  const n = width * height
  const out = new Float32Array(n * 3)
  // Scale gradients into image space so bumpiness is resolution-independent.
  const k = 0.02 * strength * Math.max(width, height)
  // Depth jumps beyond ~sigma (normalized 0..1) read as silhouettes, not relief.
  const sigma = 0.07
  const inv2s2 = 1 / (2 * sigma * sigma)

  // Edge map = local depth-jump magnitude, dilated to cover the soft transition
  // band around each silhouette (not just its single steepest pixel).
  const edge = new Float32Array(n)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const l = depth[x > 0 ? i - 1 : i]!
      const r = depth[x < width - 1 ? i + 1 : i]!
      const t = depth[y > 0 ? i - width : i]!
      const b = depth[y < height - 1 ? i + width : i]!
      edge[i] = Math.max(Math.abs(r - l), Math.abs(b - t))
    }
  }
  const edgeRadius = Math.max(2, Math.round(Math.max(width, height) / 320))
  const edgeD = dilateMaxFloat(edge, width, height, edgeRadius)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const l = depth[x > 0 ? i - 1 : i]!
      const r = depth[x < width - 1 ? i + 1 : i]!
      const t = depth[y > 0 ? i - width : i]!
      const b = depth[y < height - 1 ? i + width : i]!
      // One edge-aware weight from the dilated edge map suppresses the whole band.
      const w = Math.exp(-(edgeD[i]! * edgeD[i]!) * inv2s2)
      const gx = (r - l) * 0.5 * k * w
      const gy = (b - t) * 0.5 * k * w
      // Height rises toward the camera (near = 1), so the normal tilts away from
      // increasing depth. +y points up in view space (the renderer flips image y
      // on upload, so we keep gy's sign to match screen-up here).
      let nx = -gx
      let ny = gy
      let nz = 1
      const len = Math.hypot(nx, ny, nz) || 1
      nx /= len
      ny /= len
      nz /= len
      out[i * 3] = nx
      out[i * 3 + 1] = ny
      out[i * 3 + 2] = nz
    }
  }
  return out
}

/**
 * Estimate normals + depth from RGBA pixels.
 *
 * Runs the depth model, normalizes to a 0..1 height-field, resizes back to the
 * source resolution, lightly smooths it (to suppress 8-bit banding), and derives
 * unit normals from the gradient. Returns float buffers plus the PNG-ready pack.
 */
export async function estimateGBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: GBufferOptions = {},
): Promise<GBuffer> {
  const { onInference, normalStrength = 1 } = options
  const pipe = await getDepthPipeline(options)

  const image = new RawImage(Uint8ClampedArray.from(rgba), width, height, 4)
  onInference?.(10)
  const out = await pipe(image)
  onInference?.(85)

  const result = Array.isArray(out) ? out[0]! : out
  const predicted = result.predicted_depth
  const dims = predicted.dims
  const ph = dims[dims.length - 2] as number
  const pw = dims[dims.length - 1] as number

  const depthSmall = normalizeDepth(predicted.data as Float32Array)
  const depthFull = resizeFloat(depthSmall, pw, ph, width, height)
  // Blur radius scales with size: low-bit depth bands more once upscaled, and
  // smoother depth means cleaner normals (the edge-aware step keeps silhouettes).
  const blurRadius = Math.max(1, Math.round(Math.max(width, height) / 640))
  const depthSmooth = boxBlur(depthFull, width, height, blurRadius)
  const normals = normalsFromDepth(depthSmooth, width, height, normalStrength)
  onInference?.(100)

  const packed = packGBuffer(normals, depthFull, width, height)
  return { packed, normals, depth: depthFull, width, height }
}
