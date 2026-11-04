/**
 * Geometry of the process signal, shared by the React labels and the engine (which
 * precomputes head / node / orb positions once per frame for the shader).
 */

/** Ribbon nodes, as fractions of the run (the viewport width, or RIBBON_V's span). */
export const RIBBON_NODES = [0.14, 0.38, 0.62, 0.86]

/** Ribbon head position for a section progress p (0..1): starts off screen on the left. */
export const ribbonHead = (p: number) => -0.08 + p * 1.03

/** Wave phase for a section progress p: the signal slowly rolls as you scroll. */
export const ribbonPhase = (p: number) => p * 2.4

/**
 * Vertical layout (mobile): the run goes from `start` to `start + span` of the viewport
 * height, top to bottom, and the wave swings around x = `center` (fractions of the width).
 */
export const RIBBON_V = { start: 0.32, span: 0.6, center: 0.14 }

/** Media query for the vertical layout (matches the CSS mobile breakpoint). */
export const RIBBON_VERTICAL_QUERY = "(max-width: 767px)"

/** Wave amplitude, as a fraction of the viewport height (horizontal) or width (vertical). */
export const RIBBON_AMP = 0.075

/** Offset across the run (0..1, 0.5 = rest; bottom-up like the shader's uv.y when horizontal) at x. */
export function ribbonY(x: number, phase: number) {
  const env = 0.35 + 0.65 * Math.sin(Math.PI * x)
  return 0.5 + RIBBON_AMP * env * Math.sin(x * Math.PI * 2 * 1.35 + phase)
}
