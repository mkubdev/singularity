/**
 * Geometry of the process signal, shared by the React labels and the engine (which
 * precomputes head / node / orb positions once per frame for the shader).
 */

/** Ribbon nodes, as fractions of the viewport width. */
export const RIBBON_NODES = [0.14, 0.38, 0.62, 0.86]

/** Ribbon head position for a section progress p (0..1): starts off screen on the left. */
export const ribbonHead = (p: number) => -0.08 + p * 1.03

/** Wave phase for a section progress p: the signal slowly rolls as you scroll. */
export const ribbonPhase = (p: number) => p * 2.4

/** Wave amplitude, as a fraction of the viewport height. */
export const RIBBON_AMP = 0.075

/** Height of the signal (0..1, bottom-up like the shader's uv.y) at x for a phase. */
export function ribbonY(x: number, phase: number) {
  const env = 0.35 + 0.65 * Math.sin(Math.PI * x)
  return 0.5 + RIBBON_AMP * env * Math.sin(x * Math.PI * 2 * 1.35 + phase)
}
