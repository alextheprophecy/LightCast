/**
 * GLSL for the relight pass. Inputs are three textures — the source photo (base),
 * normals, depth — plus light uniforms. Output is the relit image.
 *
 * Rather than recover an albedo and re-shade (which flattens the photo into a
 * washed-out, sketchy image), we *modulate* the original photographically: a
 * half-Lambert key brightens toward the light and gently darkens away from it
 * (floored by ambient), so all of the photo's colour, texture and contrast are
 * preserved while a movable directional light is sculpted on top. A cheap
 * screen-space contact shadow and a soft specular sheen round it out.
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

uniform sampler2D u_albedo;   // source photo / base color (sRGB)
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
  vec3 base = srgbToLinear(texture(u_albedo, v_uv).rgb);
  vec3 n = normalize(texture(u_normal, v_uv).xyz * 2.0 - 1.0);
  float z = texture(u_depth, v_uv).r;

  vec3 L = normalize(u_lightDir);
  // Half-Lambert wrap (0..1): soft, photographic, never a hard terminator.
  float wrap = dot(n, L) * 0.5 + 0.5;
  float shadow = contactShadow(v_uv, z, L);

  // Modulate the photo around neutral: ambient sets how far the away-from-light
  // side may darken; the lit side brightens. The base image is never removed, so
  // colour, texture and contrast survive — we only redistribute light.
  float darkFloor = mix(1.0 - 0.55 * u_intensity, 1.0, clamp(u_ambient, 0.0, 1.0));
  float factor = mix(darkFloor, 1.0 + 0.5 * u_intensity, wrap) * shadow;
  vec3 lit = base * factor;

  // Tint only the lit side toward the light colour (shadows stay neutral).
  vec3 tint = mix(vec3(1.0), u_lightColor, clamp((wrap - 0.5) * 2.0 * u_intensity, 0.0, 1.0));
  lit *= tint;

  // Soft specular sheen where the surface faces the light.
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 48.0) * u_specular * max(wrap - 0.5, 0.0) * 2.0;
  lit += spec * u_lightColor * shadow;

  fragColor = vec4(linearToSrgb(clamp(lit, 0.0, 1.0)), 1.0);
}`
