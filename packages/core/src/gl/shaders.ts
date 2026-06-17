/**
 * GLSL for the relight pass. Inputs are three textures — albedo (de-lit base),
 * normals, depth — plus light uniforms. Output is the relit, shaded image.
 *
 * The fragment shader does ambient + Lambert key + rim, then ray-marches the
 * depth buffer toward the light for a cheap screen-space contact shadow.
 */

export const VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

export const FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_albedo;   // de-lit base color (sRGB)
uniform sampler2D u_normal;   // xyz packed 0..1
uniform sampler2D u_depth;    // depth in .r, 0..1 (near = 1)

uniform vec3  u_lightDir;     // unit, view space
uniform vec3  u_lightColor;   // linear
uniform float u_intensity;
uniform float u_ambient;
uniform float u_specular;
uniform float u_shadows;      // 0 or 1
uniform vec2  u_texel;        // 1.0 / resolution

vec3 srgbToLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3 linearToSrgb(vec3 c){ return pow(c, vec3(1.0/2.2)); }

// March from the fragment toward the light; if a *local* occluder rises above the
// ray, occlude. A depth cliff (silhouette) is a separate object, not a caster, so
// ignore jumps outside a thickness window — otherwise edges get hard dark halos.
float contactShadow(vec2 uv, float z, vec3 L) {
  if (u_shadows < 0.5) return 1.0;
  vec2 dir = normalize(L.xy + 1e-5) * u_texel * 2.0;
  float occ = 0.0;
  float stepZ = L.z * 0.015;
  vec2 p = uv;
  float rz = z;
  for (int i = 0; i < 16; i++) {
    p += dir;
    rz += stepZ;
    float diff = texture(u_depth, p).r - rz;
    if (diff > 0.01 && diff < 0.08) { occ += 1.0; }
  }
  return clamp(1.0 - occ / 16.0 * 0.6, 0.4, 1.0);
}

void main() {
  vec3 albedo = srgbToLinear(texture(u_albedo, v_uv).rgb);
  vec3 n = normalize(texture(u_normal, v_uv).xyz * 2.0 - 1.0);
  float z = texture(u_depth, v_uv).r;

  vec3 L = normalize(u_lightDir);
  float ndl = max(dot(n, L), 0.0);
  float shadow = contactShadow(v_uv, z, L);

  // Blinn-Phong-ish specular toward the viewer (V = +z).
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 32.0) * u_specular;

  // Subtle rim for separation. Kept small and tied to the key light's direction
  // so it reads as light wrapping a curved surface, not a uniform white outline.
  float rim = pow(1.0 - max(n.z, 0.0), 3.0) * 0.1 * max(ndl, u_ambient);

  vec3 lit = albedo * (u_ambient + ndl * u_intensity * shadow) * u_lightColor
           + spec * u_lightColor * shadow
           + rim * u_lightColor;

  fragColor = vec4(linearToSrgb(lit), 1.0);
}`
