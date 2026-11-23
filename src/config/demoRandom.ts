// Seeded randomness keeps separate views and repeated renders on the same scenario.
export function demoRandom(seed: string): () => number {
  let state = 2166136261
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

export function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

/** Uneven 1–3 SP events, with recovery gaps and a sparse budget in each half-day. */
export function demoIssueWindows(seed: string): { start: number; length: number }[] {
  const random = demoRandom(seed)
  const count = randomInt(random, 4, 6)
  const windows: { start: number; length: number }[] = []
  for (let attempt = 0; windows.length < count && attempt < 256; attempt++) {
    const length = randomInt(random, 1, 3)
    const start = windows.length === 0 ? randomInt(random, 0, 24 - length)
      : windows.length === 1 ? randomInt(random, 24, 48 - length)
      : randomInt(random, 0, 48 - length)
    if (windows.some(w => start <= w.start + w.length && start + length >= w.start)) continue
    const proposed = [...windows, { start, length }]
    const occupied = proposed.flatMap(w => Array.from({ length: w.length }, (_, i) => w.start + i))
    if (occupied.filter(i => i < 24).length > 8 || occupied.filter(i => i >= 24).length > 8) continue
    windows.push({ start, length })
  }
  return windows.sort((a, b) => a.start - b.start)
}
