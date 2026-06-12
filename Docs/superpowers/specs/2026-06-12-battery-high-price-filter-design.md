# Battery Summary — High Price Filter & Card — Design Spec

**Date:** 2026-06-12
**Status:** Approved for planning

---

## Overview

Add a "High Price" classification to the Battery Summary tab. The operator enters a
maximum `£ MEL` price; any unit whose `priceToMel` exceeds that threshold is carved
out of the **Usable** total and reported separately on a new **High Price** summary
card.

---

## Classification Order

Mutually exclusive, evaluated in this order:

```
Total
├─ Constrained   (fails GSP filter)
├─ Contracted    (AS service ticked)
├─ High Price    (priceToMel > threshold, among the remainder)
└─ Usable        (everything else)
```

A unit is only checked against the price threshold if it is not already
Constrained or Contracted. Units with `priceToMel === 0` (no price data, displayed
as `—`) can never be classified as High Price, since `0 > threshold` is false for
any positive threshold.

When the threshold is unset (empty input) or `0`, no unit is classified as High
Price — behaviour is identical to today.

---

## `src/utils/batteryReliability.ts`

```ts
export interface ReliabilityRow extends BatteryAvailabilityRow {
  service: ServiceType | undefined
  constrained: boolean
  contracted: boolean
  highPrice: boolean   // new
  included: boolean    // now also excludes highPrice — see below
}

export interface ReliabilityTotals {
  total: number
  constrained: number
  contracted: number
  highPrice: number     // new
  usable: number         // now reflects the post-carve-out figure
  reliable: number
  margin: number
}

export function computeBatteryReliability(
  rows: BatteryAvailabilityRow[],
  gspFilter: Record<string, 'include' | 'exclude'>,
  asFilter: { sr: boolean; qr: boolean },
  unitServices: Record<string, ServiceType>,
  deRatePct: number,
  requirementMW: number,
  priceThreshold?: number   // new, optional; undefined/0 = disabled
): { rows: ReliabilityRow[]; totals: ReliabilityTotals }
```

Logic changes:

```ts
const highPrice = !constrained && !contracted
  && !!priceThreshold && priceThreshold > 0
  && r.priceToMel > priceThreshold

const included = !constrained && !contracted && !highPrice
```

`totals.highPrice` and `totals.usable` derive from `included`/`highPrice` exactly
as the other totals do today (sum of `avail` over matching rows).

**Backward compatibility**: `BatteryReliabilityTab.tsx` calls this function without
the new argument. With `priceThreshold === undefined`, `highPrice` is always
`false`, so `included`/`usable` are unchanged from current behaviour — no edits
needed to that file.

---

## `src/components/BatterySummaryTab.tsx`

### New local state

```ts
const [priceThreshold, setPriceThreshold] = useState('')   // string, empty = disabled
```

Parsed at the `computeBatteryReliability` call site:
`priceThreshold === '' ? undefined : Number(priceThreshold)`.

### Filter row

A new inline labeled number input, placed after the AS Services filter button:

```
[ GSP ▾ ] [ AS Services ▾ ]  Max £ MEL [   ]          Next 30 min | ... | Next 2h
```

Styled like the Reliability tab's "Requirement (MW)" / "De-rate (%)" inputs
(`<label>` wrapping text + `<input type="number">`, ~70–90px wide).

### Cards

New `CardId` `'highPrice'`, inserted between `'constrained'` and `'usable'`:

```ts
type CardId = 'total' | 'contracted' | 'constrained' | 'highPrice' | 'usable'

CARD_COLORS.highPrice = '#f59e0b'   // amber
CARD_LABELS.highPrice = 'High Price'
```

Card order rendered: **Total | Contracted | Constrained | High Price | Usable**.

```ts
const highPriceRows = classified.filter(r => r.highPrice)
const usableRows    = classified.filter(r => r.included)   // now post-carve-out

cardData.highPrice = { rows: highPriceRows, sum: sumCapacity(highPriceRows) }
cardData.usable    = { rows: usableRows,    sum: sumCapacity(usableRows) }
```

Empty-card dimming (40% opacity) and click-to-filter behaviour apply to the new
card exactly as the existing ones.

### Table / default view

No change — default view (`!selectedCard`) remains "all non-constrained units"
(`classified.filter(r => !r.constrained)`), so High Price units stay visible in
the default table; only the Usable card's sum/count change.

---

## What Does NOT Change

- `BatteryReliabilityTab.tsx` — untouched (relies on the documented backward
  compatibility of the new optional parameter).
- `BatteryRedeclareTab.tsx`, `GspFilterPopover.tsx`, `BatteryFilters.tsx` —
  untouched.
- No new `page.tsx` state — `priceThreshold` is local to `BatterySummaryTab`,
  matching the precedent that local state in stay-mounted Battery tabs survives
  tab switches.
- No Zustand changes.

---

## Decisions

- **Carve-out, not overlay**: High Price is only evaluated for units that are
  neither Constrained nor Contracted, keeping all four non-Total cards strictly
  partitioning Total (no double counting).
- **Inline numeric input**, not a popover — a single number doesn't warrant the
  GSP/AS-Services popover treatment; matches the Reliability tab's existing
  Requirement/De-rate input style.
- **Scope**: Reliability tab is intentionally unaffected. If a shared "exclude
  high-price units fleet-wide" concept is wanted later, `priceThreshold` can be
  lifted to `page.tsx` at that point.
