// Number formatting (spec §4): en-GB separators, real minus sign U+2212, explicit + on positives.

export const MINUS = '−'

const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

export function formatInt(v: number): string {
  return nf.format(Math.round(Math.abs(v)))
}

/** "+1,288" / "−670" / "+0" */
export function formatSigned(v: number): string {
  const r = Math.round(v)
  return (r < 0 ? MINUS : '+') + nf.format(Math.abs(r))
}

/** Unsigned magnitude for the IC worst block: ≥1,000 → "2.3 GW", otherwise "650 MW". */
export function formatSwingMagnitude(absMw: number): string {
  if (absMw >= 1000) return `${(absMw / 1000).toFixed(1)} GW`
  return `${formatInt(absMw)} MW`
}

/** Text for aria-labels: "minus 670" / "plus 950". */
export function spokenSigned(v: number): string {
  const r = Math.round(v)
  return `${r < 0 ? 'minus' : 'plus'} ${nf.format(Math.abs(r))}`
}

export function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}
