/**
 * Hand-written, dependency-free WebGL2 relight renderer.
 *
 * Uploads three textures (albedo, normals, depth) once, then re-renders a
 * fullscreen quad every time the light changes — so relighting is real-time
 * regardless of how slow the one-off geometry inference was.
 *
 * The GL plumbing (compile/link/bind) is intentionally minimal here; the first
 * implementation PR fills `upload()` and `render()`. The uniform contract and
 * lifecycle are real so the scene controller can be written against it.
 */
import { FRAG, VERT } from './shaders'
import type { GBuffer } from '../types'

export interface LightUniforms {
  lightDir: [number, number, number]
  lightColor: [number, number, number]
  intensity: number
  ambient: number
  specular: number
  shadows: boolean
}

export class RelightRenderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext

  constructor(width: number, height: number, canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false })
    if (!gl) throw new Error('lightcast: WebGL2 is required but not available.')
    this.gl = gl
    void VERT
    void FRAG
  }

  /** Upload albedo (de-lit) + the G-buffer as textures. Call once per image. */
  upload(_albedo: Uint8ClampedArray, _gbuffer: GBuffer): void {
    throw new Error('lightcast: RelightRenderer.upload not wired yet — see PLAN.md §4.')
  }

  /** Re-render with new light uniforms. Cheap; call on every light change/frame. */
  render(_u: LightUniforms): void {
    throw new Error('lightcast: RelightRenderer.render not wired yet — see PLAN.md §4.')
  }

  dispose(): void {
    const ext = this.gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
  }
}
