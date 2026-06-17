/**
 * Hand-written, dependency-free WebGL2 relight renderer.
 *
 * Uploads three textures (albedo, normals, depth) once, then re-renders a
 * fullscreen quad every time the light changes — so relighting is real-time
 * regardless of how slow the one-off geometry inference was.
 *
 * The uniform contract and lifecycle are public so the scene controller can be
 * written against it; the GL plumbing (compile/link/bind/upload/draw) lives here.
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

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`lightcast: shader compile failed: ${log}`)
  }
  return sh
}

export class RelightRenderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject
  private uniforms: Record<string, WebGLUniformLocation | null> = {}
  private albedoTex: WebGLTexture
  private normalTex: WebGLTexture
  private depthTex: WebGLTexture
  private width: number
  private height: number

  constructor(width: number, height: number, canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.width = width
    this.height = height
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false })
    if (!gl) throw new Error('lightcast: WebGL2 is required but not available.')
    this.gl = gl

    // --- program ---
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.bindAttribLocation(program, 0, 'a_pos')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`lightcast: program link failed: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program
    for (const name of [
      'u_albedo',
      'u_normal',
      'u_depth',
      'u_lightDir',
      'u_lightColor',
      'u_intensity',
      'u_ambient',
      'u_specular',
      'u_shadows',
      'u_texel',
    ]) {
      this.uniforms[name] = gl.getUniformLocation(program, name)
    }

    // --- fullscreen quad ---
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    // Two triangles covering clip space.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    this.albedoTex = gl.createTexture()!
    this.normalTex = gl.createTexture()!
    this.depthTex = gl.createTexture()!
  }

  private texImage(
    tex: WebGLTexture,
    internalFormat: number,
    format: number,
    data: ArrayBufferView,
  ): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      this.width,
      this.height,
      0,
      format,
      gl.UNSIGNED_BYTE,
      data,
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  /** Upload albedo (de-lit) + the G-buffer as textures. Call once per image. */
  upload(albedo: Uint8ClampedArray, gbuffer: GBuffer): void {
    const gl = this.gl
    const n = this.width * this.height

    // Albedo: RGBA8, .rgb sampled as sRGB base color.
    this.texImage(this.albedoTex, gl.RGBA, gl.RGBA, albedo)

    // Normals: re-use the packed buffer's RGB (normal.xyz mapped 0..1).
    this.texImage(this.normalTex, gl.RGBA, gl.RGBA, gbuffer.packed.data)

    // Depth: single channel R8 from the float depth (near = 1).
    const depth8 = new Uint8Array(n)
    for (let i = 0; i < n; i++) depth8[i] = Math.round(gbuffer.depth[i]! * 255)
    this.texImage(this.depthTex, gl.R8, gl.RED, depth8)
  }

  /** Re-render with new light uniforms. Cheap; call on every light change/frame. */
  render(u: LightUniforms): void {
    const gl = this.gl
    gl.viewport(0, 0, this.width, this.height)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.albedoTex)
    gl.uniform1i(this.uniforms.u_albedo!, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.normalTex)
    gl.uniform1i(this.uniforms.u_normal!, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.depthTex)
    gl.uniform1i(this.uniforms.u_depth!, 2)

    gl.uniform3fv(this.uniforms.u_lightDir!, u.lightDir)
    gl.uniform3fv(this.uniforms.u_lightColor!, u.lightColor)
    gl.uniform1f(this.uniforms.u_intensity!, u.intensity)
    gl.uniform1f(this.uniforms.u_ambient!, u.ambient)
    gl.uniform1f(this.uniforms.u_specular!, u.specular)
    gl.uniform1f(this.uniforms.u_shadows!, u.shadows ? 1 : 0)
    gl.uniform2f(this.uniforms.u_texel!, 1 / this.width, 1 / this.height)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    const gl = this.gl
    gl.deleteTexture(this.albedoTex)
    gl.deleteTexture(this.normalTex)
    gl.deleteTexture(this.depthTex)
    gl.deleteProgram(this.program)
    gl.deleteVertexArray(this.vao)
    const ext = gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
  }
}
