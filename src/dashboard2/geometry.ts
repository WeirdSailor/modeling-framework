// Shared x-scale and SVG path helpers (no charting library — spec §13).

import { SP_MS } from './time'

export interface XScale {
  startMs: number
  endMs: number
  width: number
  nSp: number
  spWidth: number
  x(ms: number): number
  /** SP start containing pixel x (clamped to the window). */
  spAt(px: number): number
}

export function createXScale(startMs: number, endMs: number, width: number): XScale {
  const span = endMs - startMs
  const nSp = Math.max(1, Math.round(span / SP_MS))
  const spWidth = width / nSp
  return {
    startMs, endMs, width, nSp, spWidth,
    x: ms => ((ms - startMs) / span) * width,
    spAt: px => startMs + Math.min(nSp - 1, Math.max(0, Math.floor(px / spWidth))) * SP_MS,
  }
}

const f = (n: number) => Math.round(n * 10) / 10

/**
 * Monotone cubic interpolation (Fritsch–Carlson tangents, as d3.curveMonotoneX) through points with
 * increasing x. Returns the path commands AFTER the first point (caller supplies the M/L to it).
 * Monotone means no overshoot: the curve never crosses a level that both neighbouring points sit on
 * the same side of.
 */
export function monotoneCommands(pts: [number, number][]): string {
  const n = pts.length
  if (n < 2) return ''
  if (n === 2) return `L${f(pts[1][0])},${f(pts[1][1])}`

  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]))

  const m: number[] = new Array(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    const s0 = d[i - 1], s1 = d[i]
    if (s0 * s1 <= 0) { m[i] = 0; continue }
    const h0 = pts[i][0] - pts[i - 1][0], h1 = pts[i + 1][0] - pts[i][0]
    const p = (s0 * h1 + s1 * h0) / (h0 + h1)
    m[i] = Math.sign(s0) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) * 2
  }
  // End tangents (d3's slope2), clamped to stay monotone on the end segments.
  const endTangent = (secant: number, inner: number) => {
    const t = (3 * secant - inner) / 2
    if (secant === 0 || Math.sign(t) !== Math.sign(secant)) return 0
    return Math.abs(t) > 3 * Math.abs(secant) ? 3 * secant : t
  }
  m[0] = endTangent(d[0], m[1])
  m[n - 1] = endTangent(d[n - 2], m[n - 2])

  let out = ''
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]
    const h = (x1 - x0) / 3
    out += `C${f(x0 + h)},${f(y0 + m[i] * h)} ${f(x1 - h)},${f(y1 - m[i + 1] * h)} ${f(x1)},${f(y1)}`
  }
  return out
}

/** Triangle marker polygon points: 'down' ▼ / 'up' ▲, ~10×9px at scale 1, centred on (x, y). */
export function arrowPoints(x: number, y: number, dir: 'down' | 'up', s = 1): string {
  return dir === 'down'
    ? `${x - 5 * s},${y - 4 * s} ${x + 5 * s},${y - 4 * s} ${x},${y + 5 * s}`
    : `${x - 5 * s},${y + 4 * s} ${x + 5 * s},${y + 4 * s} ${x},${y - 5 * s}`
}
