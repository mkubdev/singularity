varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  float a = exp(-d * 18.0) * vAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor * a * 0.75, 1.0);
}
