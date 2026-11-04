// Accretion matter: each particle follows a Keplerian orbit and slowly spirals
// inward, respawning at the outer edge. Motion is analytic (no CPU work).
attribute vec4 aOrbit; // r0, angle0, height, seed

uniform float uTime;
uniform float uPixel;
uniform float uGain;
uniform float uTint;
uniform vec3 uCamPos;

varying vec3 vColor;
varying float vAlpha;

const float R_IN = 2.2;
const float R_OUT = 16.0;

void main() {
  float seed = aOrbit.w;
  float span = R_OUT - R_IN;
  float fall = uTime * (0.05 + seed * 0.12);
  float r = R_IN + mod(aOrbit.x - R_IN - fall, span);
  float omega = 2.6 * pow(r, -1.5);
  float ang = aOrbit.y + uTime * omega * 0.55;

  float thick = 0.03 + 0.05 * smoothstep(R_IN, R_OUT, r);
  float y = aOrbit.z * thick * r * (1.0 + 0.4 * sin(ang * 3.0 + seed * 40.0));
  vec3 pos = vec3(cos(ang) * r, y, sin(ang) * r);

  // Hide matter that sits behind the shadow as seen from the camera.
  vec3 toP = pos - uCamPos;
  float L = length(toP);
  vec3 dir = toP / L;
  float tc = dot(-uCamPos, dir);
  float miss = length(uCamPos + dir * tc);
  float occl = (tc > 0.0 && tc < L) ? smoothstep(2.3, 2.9, miss) : 1.0;

  vec3 vel = normalize(vec3(-pos.z, 0.0, pos.x)) * sqrt(0.5 / r);
  float approach = dot(vel, -dir);
  float beam = pow(clamp(1.0 + approach * 1.3, 0.15, 2.4), 3.0);

  float edge = smoothstep(R_IN, R_IN + 0.8, r) * (1.0 - smoothstep(R_OUT - 3.0, R_OUT, r));
  float heat = pow(R_IN / r, 1.4);

  vec3 warm = vec3(1.0, 0.9, 0.8);
  vec3 cool = vec3(0.78, 0.88, 1.0);
  vec3 ion = vec3(0.45, 0.85, 1.0);
  vColor = mix(mix(warm, cool, smoothstep(-0.2, 0.2, approach)), ion, uTint * seed);
  vAlpha = occl * edge * beam * heat * uGain * (0.35 + seed * 0.9);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uPixel * (0.4 + seed * 0.9) / -mv.z, 1.0, 3.5);
}
