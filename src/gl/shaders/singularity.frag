// Geodesic raymarcher: Schwarzschild-like light bending around a black hole (rs = 1),
// a thin accretion disk advected with Keplerian shear, and a lensed starfield.
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uFov;
uniform float uIntro;
uniform float uDiskGain;
uniform float uTint;

varying vec2 vUv;

const float DISK_IN = 2.6;
const float DISK_OUT = 12.0;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

// Octave count is a compile-time constant so loops unroll.
#define FBM(NAME, OCT) float NAME(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < OCT; i++) { s += a * noise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / (1.0 - pow(0.5, float(OCT))) * 0.97; }
FBM(fbm4, 4)
FBM(fbm3, 3)
FBM(fbm2, 2)

vec3 starfield(vec3 d) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float sc = 70.0 + float(l) * 110.0;
    vec3 q = d * sc;
    vec3 id = floor(q);
    vec3 f = fract(q) - 0.5;
    float h = hash13(id + float(l) * 17.0);
    if (h > 0.986) {
      float b = (h - 0.986) / 0.014;
      float s = smoothstep(0.5, 0.0, length(f));
      c += pow(s, 7.0) * b * mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.92, 0.85), hash13(id + 3.0)) * 2.2;
    }
  }
  float dust = fbm2(d * 2.4 + 4.0);
  c += vec3(0.018, 0.02, 0.028) * pow(dust, 5.0) * 1.6;
  return c;
}

vec3 diskSample(vec3 p, vec3 rd, out float alpha) {
  float r = length(p.xz);
  if (r < DISK_IN || r > DISK_OUT) { alpha = 0.0; return vec3(0.0); }

  float ang = atan(p.z, p.x);
  float omega = 2.6 * pow(r, -1.5);
  float a = ang - uTime * omega * 0.55;

  // Tangentially stretched turbulence -> sheared spiral filaments.
  vec3 q = vec3(cos(a) * 2.6, sin(a) * 2.6, r * 1.35 - uTime * 0.04);
  float n = fbm4(q);
  float fil = fbm3(vec3(cos(a) * 7.0, sin(a) * 7.0, r * 4.2 + n * 2.0));
  float dens = pow(clamp(n * 1.25 - 0.18, 0.0, 1.0), 1.6) * (0.55 + fil * 0.9);

  float prof = smoothstep(DISK_IN, DISK_IN + 0.5, r) * (1.0 - smoothstep(DISK_OUT * 0.55, DISK_OUT, r));
  float falloff = pow(DISK_IN / r, 2.1);

  // Relativistic beaming: the side rotating toward the camera is brighter.
  vec3 vel = normalize(vec3(-p.z, 0.0, p.x)) * sqrt(0.5 / r);
  float approach = dot(vel, -rd);
  float beam = pow(clamp(1.0 + approach * 1.25, 0.15, 2.4), 3.0);

  float emit = prof * falloff * dens * beam * 3.8 * uDiskGain;
  alpha = clamp(emit * 0.55 + prof * 0.06, 0.0, 0.96);

  // Near-monochrome silver; color mostly comes from dispersion in post.
  vec3 warm = vec3(1.0, 0.9, 0.82);
  vec3 cool = vec3(0.8, 0.88, 1.0);
  vec3 ion = vec3(0.55, 0.85, 1.0);
  vec3 tint = mix(warm, cool, smoothstep(-0.25, 0.25, approach));
  tint = mix(tint, ion, uTint * (0.4 + 0.6 * fil));
  vec3 hot = mix(tint, vec3(1.0), smoothstep(0.6, 2.4, emit));
  return hot * emit;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  vec3 fw = normalize(uCamTarget - uCamPos);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw + uFov * (uv.x * rt + uv.y * up));

  vec3 p = uCamPos;
  vec3 v = rd;
  vec3 hh = cross(p, v);
  float h2 = dot(hh, hh);

  vec3 col = vec3(0.0);
  float T = 1.0;
  bool captured = false;

  for (int i = 0; i < 180; i++) {
    float r = length(p);
    if (r < 1.0) { captured = true; break; }
    // Escaping ray beyond the disk: no more crossings, residual bending is negligible.
    if (r > DISK_OUT + 1.0 && dot(p, v) > 0.0) break;

    // Long strides in empty space, fine steps near the photon sphere.
    float dt = r > DISK_OUT + 2.0 ? 0.35 * (r - DISK_OUT) + 1.0 : clamp(0.09 * (r - 0.9), 0.012, 1.4);
    v += -1.5 * h2 * p / pow(r, 5.0) * dt;
    vec3 np = p + v * dt;

    if (p.y * np.y < 0.0) {
      float f = p.y / (p.y - np.y);
      vec3 q = mix(p, np, f);
      float a;
      vec3 e = diskSample(q, normalize(v), a);
      col += T * e;
      T *= 1.0 - a;
      if (T < 0.02) break;
    }

    // Faint halo hugging the photon sphere.
    col += T * vec3(0.85, 0.9, 1.0) * 0.008 * dt * exp(-abs(r - 1.5) * 4.0) * uDiskGain;
    p = np;
  }

  if (!captured) col += T * starfield(normalize(v));

  gl_FragColor = vec4(col * uIntro, 1.0);
}
