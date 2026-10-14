// Time model for Dashboard 2 (spec §5). Timeline is built from UTC instants in 30-minute steps and
// displayed in Europe/London. Never assumes 48 SPs per day.
// No value imports — keeps this module runnable under `node --test` with type stripping.

export const SP_MS = 30 * 60 * 1000
export const LONDON_TZ = 'Europe/London'

export function floorToSp(ms: number): number {
  return Math.floor(ms / SP_MS) * SP_MS
}

export function ceilToSp(ms: number): number {
  return Math.ceil(ms / SP_MS) * SP_MS
}

/** UTC SP start instants in [startMs, endMs). */
export function spStartsBetween(startMs: number, endMs: number): number[] {
  const out: number[] = []
  for (let t = floorToSp(startMs); t < endMs; t += SP_MS) if (t >= startMs) out.push(t)
  return out
}

// ── Europe/London conversion ─────────────────────────────────────────────

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
})

export interface LondonParts {
  year: number; month: number; day: number
  hour: number; minute: number; second: number
  weekday: string // "Thu"
}

export function londonParts(ms: number): LondonParts {
  const p: Record<string, string> = {}
  for (const { type, value } of partsFmt.formatToParts(new Date(ms))) p[type] = value
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour, minute: +p.minute, second: +p.second,
    weekday: p.weekday,
  }
}

/** London offset from UTC at the given instant, in ms (0 in GMT, 3,600,000 in BST). */
export function londonOffsetMs(ms: number): number {
  const p = londonParts(ms)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(ms / 1000) * 1000
}

/** Converts a Europe/London wall-clock time to a UTC instant. */
export function londonLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const first = guess - londonOffsetMs(guess)
  return guess - londonOffsetMs(first)
}

/** UTC instant of 00:00 Europe/London on the given settlement date (YYYY-MM-DD). */
export function londonMidnightUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return londonLocalToUtc(y, m, d, 0, 0)
}

/** All SP start instants for a settlement day: 46 on spring-forward, 50 on fall-back, else 48. */
export function settlementDaySpStarts(date: string): number[] {
  const start = londonMidnightUtc(date)
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
  return spStartsBetween(start, londonMidnightUtc(nextDate))
}

/** UTC start of settlement period `sp` (1-based, per local settlement day). */
export function settlementSpStartUtc(date: string, sp: number): number {
  return londonMidnightUtc(date) + (sp - 1) * SP_MS
}

// ── Window ───────────────────────────────────────────────────────────────

export function presetWindow(nowMs: number, hours: number): { start: number; end: number } {
  const start = floorToSp(nowMs)
  return { start, end: start + hours * 60 * 60 * 1000 }
}

/** Snaps a custom range to SP boundaries: start rounds down, end rounds up. */
export function snapCustomRange(fromMs: number, toMs: number): { start: number; end: number } {
  return { start: floorToSp(fromMs), end: ceilToSp(toMs) }
}

/** Returns an error message, or null if the range is valid. */
export function validateCustomRange(fromMs: number, toMs: number, minMs: number, maxMs: number): string | null {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 'Enter both From and To'
  if (toMs <= fromMs) return 'To must be after From'
  const { start, end } = snapCustomRange(fromMs, toMs)
  if (end - start < minMs) return 'Range must be at least one settlement period'
  if (end - start > maxMs) return `Range must be ${Math.round(maxMs / 3_600_000)}h or less`
  return null
}

// ── Axis ─────────────────────────────────────────────────────────────────

export function isLondonMidnight(ms: number): boolean {
  const p = londonParts(ms)
  return p.hour === 0 && p.minute === 0
}

/** SP boundaries strictly inside (startMs, endMs) whose London wall-clock minute-of-day is a multiple of stepMinutes. */
export function axisTicks(startMs: number, endMs: number, stepMinutes: number): number[] {
  const out: number[] = []
  for (let t = floorToSp(startMs) + SP_MS; t < endMs; t += SP_MS) {
    if (t <= startMs) continue
    const p = londonParts(t)
    if ((p.hour * 60 + p.minute) % stepMinutes === 0) out.push(t)
  }
  return out
}

/** Smallest candidate step whose pixel spacing is at least minPx. */
export function pickTickStep(windowMs: number, chartWidth: number, candidates: number[], minPx: number): number {
  const pxPerMin = chartWidth / (windowMs / 60000)
  for (const c of candidates) if (c * pxPerMin >= minPx) return c
  return candidates[candidates.length - 1]
}

// ── Formatting (Europe/London) ───────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

export function formatHHMM(ms: number): string {
  const p = londonParts(ms)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

export function formatHHMMSS(ms: number): string {
  const p = londonParts(ms)
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Thu 15 Oct 18:00" */
export function formatDayDateTime(ms: number): string {
  const p = londonParts(ms)
  return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]} ${pad(p.hour)}:${pad(p.minute)}`
}

/** "Thu" */
export function formatWeekday(ms: number): string {
  return londonParts(ms).weekday
}

/** "YYYY-MM-DDTHH:MM" in London time, for <input type="datetime-local">. */
export function toLondonInputValue(ms: number): string {
  const p = londonParts(ms)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** Parses a datetime-local value as London wall-clock time. NaN if malformed. */
export function fromLondonInputValue(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!m) return NaN
  return londonLocalToUtc(+m[1], +m[2], +m[3], +m[4], +m[5])
}

export function sameLondonDay(a: number, b: number): boolean {
  const pa = londonParts(a), pb = londonParts(b)
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day
}
