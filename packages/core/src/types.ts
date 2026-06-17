/**
 * Public type contract for lightcast.
 *
 * Two workflows, mirroring depthcast:
 *
 *  1. Runtime mode    — pass an image, we estimate normals + depth in-browser.
 *  2. Precompute mode — pass an image *and* a baked `gbuffer` (normals in RGB,
 *     depth in alpha) made with the `lightcast` CLI. No model ships to visitors;
 *     the relight runs entirely in WebGL.
 */

/** Anything we know how to turn into pixels. */
export type ImageSource =
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageBitmap
  | ImageData
  | string // URL
  | File
  | Blob

/** A baked geometry buffer (precompute workflow): normals in RGB, depth in alpha. */
export type GBufferSource = ImageData | HTMLCanvasElement | HTMLImageElement | ImageBitmap | string

export type Device = 'webgpu' | 'wasm' | 'auto'

export type Quality = 'low' | 'medium' | 'high'

/**
 * How the *original* lighting baked into the photo is removed before re-lighting.
 * This is the technically interesting part — get it wrong and you double the light.
 *
 * - `grade`     — flatten the low-frequency shading (retinex/homomorphic) and re-shade.
 *                 Cheap, runs anywhere. The default.
 * - `intrinsic` — a lightweight albedo/shading decomposition for cleaner, stronger relights.
 * - `none`      — multiply-only; tints rather than truly relights (fastest).
 */
export type Delight = 'grade' | 'intrinsic' | 'none'

export type ControlMode = 'pointer' | 'orbit' | 'scroll' | 'none'

export type ProgressStage = 'model' | 'inference' | 'gbuffer' | 'build'

/** A single light. `azimuth`/`elevation` in degrees; color as hex or Kelvin temperature. */
export interface Light {
  azimuth?: number
  elevation?: number
  color?: string
  /** Color temperature in Kelvin (e.g. 5500). Overrides `color` when set. */
  temperature?: number
  intensity?: number
}

export interface LightcastOptions {
  /** ONNX geometry model id. Default `onnx-community/metric3d-vit-small`. */
  model?: string
  /** Execution backend. Default `auto` (webgpu → wasm). */
  device?: Device
  /** Preset bundling model dtype + render resolution. Default `medium`. */
  quality?: Quality
  /** Bring-your-own baked G-buffer; when provided, inference is skipped entirely. */
  gbuffer?: GBufferSource
  /** De-lighting strategy. Default `grade`. */
  delight?: Delight
  /** Key light. */
  light?: Light
  /** Ambient term, 0..1. Default 0.25. */
  ambient?: number
  /** Specular strength, 0..1. Default 0.3. */
  specular?: number
  /** Ray-marched screen-space contact shadows from depth. Default true. */
  shadows?: boolean
  /** Input device that drives the light. Default `pointer`. */
  controls?: ControlMode
  /** Motion smoothing, 0 (snappy) .. 1 (floaty). Default 0.12. */
  damping?: number
  /** Downscale longest edge to this many px before inference. Default 1024. */
  maxResolution?: number
  /** Honor `prefers-reduced-motion`. Default true. */
  respectReducedMotion?: boolean
  onProgress?: (stage: ProgressStage, pct: number) => void
}

/** Built-in named light animations. */
export type LightPreset = 'studio' | 'orbit' | 'golden-hour' | 'flicker'

export interface ExportOptions {
  preset?: LightPreset
  durationMs?: number
  fps?: number
  bitrate?: number
  mimeType?: string
}

export interface LightScene {
  readonly canvas: HTMLCanvasElement
  /** The estimated (or supplied) geometry buffer. */
  readonly gbuffer: GBuffer
  mount(container: HTMLElement): this
  /** Set the key light; partial updates merge. Degrees or -1..1 for azimuth/elevation. */
  setLight(light: Light): void
  update(options: Partial<LightcastOptions>): void
  play(animation?: LightPreset): void
  pause(): void
  exportVideo(opts?: ExportOptions): Promise<Blob>
  dispose(): void
}

/** Dense per-pixel geometry: unit normals (xyz, -1..1) + normalized depth (0..1, near=1). */
export interface GBuffer {
  /** Packed RGBA: normal.xyz mapped to RGB (0..255), depth in A. PNG-ready. */
  packed: ImageData
  /** Float normals, length width*height*3, components in -1..1. */
  normals: Float32Array
  /** Float depth, length width*height, 0..1. */
  depth: Float32Array
  width: number
  height: number
}
