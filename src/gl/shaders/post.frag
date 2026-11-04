// Composite: liquid-glass panels, iridescent glass with spectral dispersion, mip bloom,
// lacquer, process signal, ACES tone mapping, grain.
precision highp float;

#define MAX_PANES 12

uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uLacquer;  // 漆 lacquer scene weight (services)
uniform float uGlass;
uniform float uFade;
uniform float uWarp;
uniform float uCut;      // 1 -> 0 blade cut when the active service changes
uniform float uCutAngle; // direction of the slash (radians); changes every cut: a combo
uniform float uCutPower; // strength of the slash, grows along the combo
uniform vec3 uHole;      // singularity center (device px) + shadow radius (px)
uniform float uLines;    // faint red security lines
uniform float uRibbonOn; // process ribbon visible
uniform float uRibbonP;  // ribbon head, 0..1 of the screen width
uniform float uRibbonPhase;
uniform float uRibbonFade; // 1 -> 0 as the section scrolls away
uniform float uNodeAge[4]; // seconds since the signal reached each node
uniform float uSurge;      // 1 -> 0 energy surge after a node is reached
uniform float uOrbPhase;   // travel phase of the energy orbs (speeds up in a surge)
uniform float uHeadY;      // precomputed on the CPU, once per frame
uniform float uNodeY[4];
uniform vec3 uOrbs[5];     // x, y, life

const float NODES[4] = float[4](0.14, 0.38, 0.62, 0.86);

uniform float uDpr;

// Liquid-glass panes, in device pixels (origin bottom-left).
uniform vec4 uPaneRect[MAX_PANES];  // center.xy, halfSize.xy
uniform vec4 uPaneParam[MAX_PANES]; // radius, tint, frost, 0
uniform int uPaneCount;

varying vec2 vUv;

// Set per pixel before shading: frosting (mip bias) and dispersion under a pane.
float gFrost = 0.0;
vec2 gChroma = vec2(0.0);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 bloom(vec2 uv) {
  return texture2D(tScene, uv, 2.0).rgb * 0.3
       + texture2D(tScene, uv, 4.0).rgb * 0.35
       + texture2D(tScene, uv, 6.0).rgb * 0.3;
}

// Corporate security lines; a few carry a bright segment travelling across.
vec3 securityLines(vec2 fp) {
  float lpx = 7.0 * uDpr;
  float ly = floor(fp.y / lpx);
  float onLine = step(fract(fp.y / lpx), 1.0 / 7.0);
  vec3 c = vec3(0.5, 0.02, 0.03) * onLine * 0.05;
  float hl = hash12(vec2(ly, 7.0));
  if (hl < 0.035) {
    float sx = fract(uTime * (0.05 + hl * 3.0) + hl * 13.0) * (uRes.x + 400.0 * uDpr) - 200.0 * uDpr;
    c += vec3(1.0, 0.08, 0.08) * (1.0 - smoothstep(0.0, 160.0 * uDpr, abs(fp.x - sx))) * onLine * 0.9;
  }
  return c;
}

// Process signal: a wave flowing to its head, four nodes riding it.
// Keep ribbonY() in sync with src/gl/ribbon.ts.
float ribbonY(float x) {
  float env = 0.35 + 0.65 * sin(3.14159265 * x);
  return 0.5 + 0.075 * env * sin(x * 6.2831853 * 1.35 + uRibbonPhase);
}
// Analytic dy/dx of ribbonY (no extra evaluations).
float ribbonSlope(float x) {
  float k = 6.2831853 * 1.35;
  float a = x * k + uRibbonPhase;
  float env = 0.35 + 0.65 * sin(3.14159265 * x);
  float denv = 0.65 * 3.14159265 * cos(3.14159265 * x);
  return 0.075 * (denv * sin(a) + env * k * cos(a));
}

// Drawn in front of the glass (not refracted) so it reads as one continuous line.
// rgb: light to add; a: soft shadow laid underneath, so the signal reads on the dark
// sky and on the bright disk alike. Head, node and orb positions come from the CPU.
vec4 ribbon(vec2 uv) {
  // Only a band around the wave can be touched (wave + glow + shockwaves).
  float px = uRes.y / uDpr;
  if (abs(uv.y - 0.5) * px - 0.075 * px > 140.0) return vec4(0.0);

  float head = uRibbonP;
  float vis = min(1.0, uGlass * 2.5) * uRibbonFade;
  vec2 toPx = uRes / uDpr;

  // Distance to the curve, corrected by its slope so the line keeps a constant width.
  float slope = ribbonSlope(uv.x) * (uRes.y / uRes.x);
  float dy = abs(uv.y - ribbonY(uv.x)) * px / sqrt(1.0 + slope * slope);

  vec3 light = vec3(0.0);
  float shadow = 0.0;

  // Past the head, distance is measured to the head point: round cap, no seam.
  vec2 hp = vec2(uv.x - head, uv.y - uHeadY) * toPx;
  float dh = length(hp);
  float dl = uv.x < head ? dy : dh;
  float xs = min(uv.x, head);
  {
    float tail = smoothstep(0.0, 0.05, xs) * mix(0.3, 1.0, smoothstep(head - 0.35, head, xs));
    float core = exp(-pow(dl / 0.8, 2.0));
    float glow = exp(-dl / 8.0);
    float near = smoothstep(head - 0.12, head, xs);
    vec3 tint = vec3(0.93, 0.96, 1.0);
    if (near > 0.0) {
      // Toward the head the light picks up a faint iridescence, echoing the ring.
      vec3 iriT = 0.5 + 0.5 * cos(6.2831853 * (xs * 3.0 - uTime * 0.1 + vec3(0.0, 0.33, 0.67)));
      tint = mix(tint, iriT, 0.35 * near);
    }
    light += tint * (core * (0.75 + 0.9 * uSurge) + glow * (0.1 + 0.12 * uSurge)) * tail;
    shadow = max(shadow, exp(-dl / 12.0) * 0.6 * tail);
  }

  // Energy: small spheres of light travelling along the thread to the head.
  for (int k = 0; k < 5; k++) {
    vec3 o = uOrbs[k];
    if (o.z <= 0.0) continue;
    float d = length(vec2(uv.x - o.x, uv.y - o.y) * toPx);
    light += vec3(0.95, 0.97, 1.0) * (exp(-pow(d / 2.6, 2.0)) * 1.3 + exp(-d / 11.0) * 0.22) * o.z * (1.0 + 0.9 * uSurge);
    shadow = max(shadow, exp(-d / 14.0) * 0.45 * o.z);
  }

  // Head: a sharp point inside a thin ring, with a faint iridescent flare.
  if (dh < 60.0) {
    vec3 iri = 0.5 + 0.5 * cos(6.2831853 * (atan(hp.y, hp.x) / 6.2831853 + uTime * 0.05 + vec3(0.0, 0.33, 0.67)));
    light += vec3(1.0) * smoothstep(3.0, 1.8, dh) * 1.8;
    light += vec3(1.0) * exp(-pow((dh - 9.0) / 0.9, 2.0)) * 0.85;
    light += iri * exp(-pow((dh - 9.0) / 3.5, 2.0)) * 0.25;
  }
  shadow = max(shadow, exp(-dh / 20.0) * 0.75);

  for (int i = 0; i < 4; i++) {
    float lit = step(NODES[i], head);
    vec2 np = vec2(uv.x - NODES[i], uv.y - uNodeY[i]) * toPx;
    float dn = length(np);
    vec3 nc = (i == 3) ? mix(vec3(1.0), vec3(1.0, 0.0, 0.12), lit) : vec3(1.0);
    float age = uNodeAge[i];
    if (age < 1.2) {
      float a = age / 1.2;
      float fade = pow(1.0 - a, 2.0);
      // Shockwave: a ring of light leaving the node, iridescent on its edge.
      float r = 6.0 + (1.0 - pow(1.0 - a, 3.0)) * 110.0;
      float w = 1.2 + a * 5.0;
      float ring = exp(-pow((dn - r) / w, 2.0));
      if (ring > 0.002) {
        vec3 iriS = 0.5 + 0.5 * cos(6.2831853 * (atan(np.y, np.x) / 6.2831853 + a + vec3(0.0, 0.33, 0.67)));
        light += mix(nc, iriS * nc, 0.45) * ring * 1.3 * fade;
      }
      // The node ignites.
      light += nc * exp(-dn / (5.0 + a * 10.0)) * 2.2 * pow(1.0 - a, 3.0);
      // Energy rushes back along the travelled thread.
      float xw = NODES[i] - a * 0.9;
      float back = exp(-pow((uv.x - xw) * toPx.x / 46.0, 2.0)) * step(uv.x, head);
      light += nc * (exp(-pow(dl / 1.0, 2.0)) * 2.0 + exp(-dl / 10.0) * 0.35) * back * fade;
    }
    if (dn < 40.0) {
      light += nc * exp(-pow((dn - 6.0) / 0.8, 2.0)) * (0.3 + 0.7 * lit);
      light += nc * smoothstep(2.4, 1.4, dn) * 1.4 * lit;
      if (i == 3 && lit > 0.5) {
        // Live heartbeat: a small red wave every 1.6 s while the project is online.
        float hb = fract(uTime / 1.6);
        light += vec3(1.0, 0.05, 0.15) * exp(-pow((dn - (7.0 + hb * 22.0)) / 1.4, 2.0)) * 0.9 * pow(1.0 - hb, 2.0);
        light += vec3(1.0, 0.05, 0.15) * exp(-dn / 9.0) * (0.25 + 0.2 * sin(uTime * 3.9));
      }
    }
    shadow = max(shadow, exp(-dn / 14.0) * 0.55);
  }
  return vec4(light, shadow) * vis;
}

vec3 shade(vec2 uv) {
  vec2 c = uv - 0.5;

  vec2 off = vec2(0.0);
  // Radial chromatic dispersion: stronger in the glass scene and during a jump.
  float disp = 0.0025 + uGlass * 0.01 + uWarp * 0.06;
  float bias = gFrost * 1.6;
  vec3 col;
  col.r = texture2D(tScene, uv + c * disp + gChroma, bias).r;
  col.g = texture2D(tScene, uv, bias).g;
  col.b = texture2D(tScene, uv - c * disp - gChroma, bias).b;

  // Bloom is low-frequency: one sample set, no per-channel dispersion needed.
  col += bloom(uv + off) * 0.45;


  // Iridescent glass: a thin-film sheen (oil on glass) tints the light, no geometry.
  if (uGlass > 0.001) {
    float l = dot(col, vec3(0.333));
    vec3 film = 0.5 + 0.5 * cos(6.2831853 * (l * 0.9 + uv.x * 0.35 + uv.y * 0.55 + uTime * 0.02 + vec3(0.0, 0.33, 0.67)));
    col = mix(col, col * (0.55 + film * 0.9), uGlass * smoothstep(0.05, 0.9, l));
  }
  return col;
}

void main() {
  vec2 frag = gl_FragCoord.xy;

  // ---- Liquid glass: find the nearest pane ------------------------------------
  float pd = 1e5;
  vec2 pc = vec2(0.0);
  vec2 ph = vec2(1.0);
  float pr = 0.0;
  float ptint = 0.0;
  float pfrost = 0.0;
  for (int i = 0; i < MAX_PANES; i++) {
    if (i >= uPaneCount) break;
    vec4 R = uPaneRect[i];
    vec4 P = uPaneParam[i];
    float d = sdRoundBox(frag - R.xy, R.zw, P.x);
    if (d < pd) { pd = d; pc = R.xy; ph = R.zw; pr = P.x; ptint = P.y; pfrost = P.z; }
  }

  vec2 n = vec2(0.0);
  float edge = 0.0;
  float inside = 0.0;
  vec2 sp = frag;
  // Pixels within one device pixel of the outline get fractional coverage (antialiasing).
  float aa = max(uDpr, 1.0);
  if (pd < aa) {
    inside = clamp(0.5 - pd / aa, 0.0, 1.0);
    vec2 e = vec2(1.0, 0.0);
    vec2 lp = frag - pc;
    n = normalize(vec2(
      sdRoundBox(lp + e.xy, ph, pr) - sdRoundBox(lp - e.xy, ph, pr),
      sdRoundBox(lp + e.yx, ph, pr) - sdRoundBox(lp - e.yx, ph, pr)) + 1e-6);

    // Thick convex rim: the bevel bends light toward the center, the core stays clear.
    float bevel = min(max(pr, 14.0 * uDpr) * 1.15, min(ph.x, ph.y));
    edge = 1.0 - clamp(-pd / bevel, 0.0, 1.0);
    float bend = pow(edge, 2.4) * bevel * 0.85;
    sp = frag - n * bend * inside;

    gFrost = (0.6 + pfrost * 2.4) * inside;
    gChroma = n * pow(edge, 3.0) * 6.0 * inside / uRes;
  }
  // ---- Service switch: blade cut (only inside the lacquer scene) -----------------
  // uCut runs 1 -> 0: a slightly tilted slash, the image slides apart along it.
  float glB = uCut * uLacquer;
  // The slash runs through the singularity along uCutAngle; each side slides along it.
  vec2 cutT = vec2(cos(uCutAngle), sin(uCutAngle));
  vec2 cutN = vec2(-cutT.y, cutT.x);
  float cutD = dot(frag - vec2(uRes.x * 0.5, uHole.y - uRes.y * 0.06), cutN);
  if (glB > 0.0) sp += sign(cutD) * cutT * 110.0 * uDpr * uCutPower * glB * glB;
  vec2 uv = sp / uRes;

  // ---- Scene + signal ---------------------------------------------------------------
  vec3 hdr = shade(uv) * 1.05;
  if (uRibbonOn > 0.5) {
    vec4 rb = ribbon(uv);
    hdr = hdr * (1.0 - rb.a) + rb.rgb;
  }
  vec3 col = aces(hdr);

  // ---- 漆 Lacquer (services) ------------------------------------------------------
  if (uLacquer > 0.001) {
    // Liquid lacquer: the scene is only seen as red reflections on wet black.
    // Slow liquid surface: a height field whose slope bends the reflection and
    // catches a sharp specular from a light above.
    vec2 su = uv * vec2(uRes.x / uRes.y, 1.0);
    float h1 = sin(su.y * 9.0 + uTime * 0.5 + sin(su.x * 4.0 + uTime * 0.3) * 1.8);
    float h2 = cos(su.x * 7.0 - uTime * 0.4 + sin(su.y * 5.0 - uTime * 0.2) * 1.4);
    vec2 slope = vec2(
      cos(su.x * 7.0 - uTime * 0.4 + sin(su.y * 5.0 - uTime * 0.2) * 1.4) * 0.6,
      cos(su.y * 9.0 + uTime * 0.5 + sin(su.x * 4.0 + uTime * 0.3) * 1.8) * 0.8);
    vec3 sl = aces(shade(uv + slope * 0.006) * 1.1);
    float ll = dot(sl, vec3(0.299, 0.587, 0.114));
    // Deep black body; the singularity only survives as a dark red reflection.
    vec3 bg = vec3(0.003, 0.0, 0.001)
       + pow(ll, 3.6) * vec3(0.15, 0.0, 0.006)
       + smoothstep(0.86, 1.0, ll) * vec3(0.32, 0.015, 0.025);
    // Specular streaks on the wet surface.
    vec3 nrm = normalize(vec3(-slope * 0.35, 1.0));
    float spec = pow(max(dot(nrm, normalize(vec3(-0.25, 0.45, 1.0))), 0.0), 220.0);
    bg += vec3(1.0, 0.82, 0.82) * spec * (0.25 + (h1 + h2 + 2.0) * 0.12);
    // Fresnel: the surface reads darker toward the bottom, glossier toward the top.
    bg *= mix(0.55, 1.15, uv.y);
    bg += securityLines(frag);
    col = mix(col, bg, uLacquer);
  }

  if (uLines > 0.001) col += securityLines(frag) * uLines;

  // The blade: a white-hot slash with a red bloom, plus a short flash.
  if (glB > 0.0) {
    float dc = abs(cutD);
    col += vec3(1.0, 0.22, 0.18) * (exp(-dc / (1.0 * uDpr)) * 2.2 + exp(-dc / (34.0 * uDpr)) * 0.4) * glB * uCutPower;
    col *= 1.0 + 0.3 * glB * glB * uCutPower;
  }

  // ---- Glass surface lighting ----------------------------------------------------
  if (uPaneCount > 0) {
    // Soft contact shadow just outside the pane (fades out under the coverage edge).
    col *= 1.0 - 0.35 * exp(-max(pd, 0.0) / (16.0 * uDpr)) * (1.0 - inside);
  }
  if (inside > 0.0) {
    // Slight body tint so the pane reads as material, never as a dark box.
    vec3 g = col * (0.97 - ptint * 0.15) + vec3(0.003 + ptint * 0.09);
    // Inner glow hugging the bevel.
    g += vec3(0.9, 0.95, 1.0) * pow(edge, 5.0) * 0.1;
    // Specular rim, ~1px inside the outline with smooth falloff on both sides:
    // bright where the edge faces the key light (top-left), softer opposite.
    float rim = 1.0 - smoothstep(0.0, 1.1 * aa, abs(pd + 0.9 * aa));
    float key = pow(max(dot(n, normalize(vec2(-0.55, 0.85))), 0.0), 1.5);
    float fill = pow(max(dot(n, normalize(vec2(0.55, -0.85))), 0.0), 2.0);
    g += vec3(1.0) * rim * (0.14 + key * 0.6 + fill * 0.25);
    col = mix(col, g, inside);
  }

  vec2 c = vUv - 0.5;
  col *= 1.0 - dot(c, c) * 0.9;
  col = pow(col, vec3(1.0 / 2.2));
  // Film grain on the scene only: glass surfaces stay smooth.
  col += (hash12(frag + fract(uTime) * 917.0) - 0.5) * 0.03 * (1.0 - inside * 0.85);
  col *= uFade;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
