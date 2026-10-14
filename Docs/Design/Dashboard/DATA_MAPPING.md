# Dashboard 2: Data Mapping

How each Dashboard 2 area gets its data. The per-area source switch is `AREA_SOURCES` in
`src/dashboard2/dashboard.config.ts`. Set any area to `'mock'` to use `mock-data.json` instead.

## What the existing dashboard uses

The existing **Dashboard** tab (`src/components/Dashboard.tsx`) has no fetch logic of its own. It reads from:

| Source | What it holds | Refresh |
|---|---|---|
| Zustand store `settlementPeriods` (`src/store/useModellingStore.ts`) | 48 rolling slots from `fetchAllData()` (Elexon PN, day-ahead demand, reference data), or from `fetchHistoricalData()`. Each slot has `pn`, `mel`, `demand`, `emx`/`eol`/`emi` (recomputed by `refreshAllAggregates` on every draft commit), and `areaAvailability[area]` for the 7 non-Margin areas. | Loaded on page mount and by the sidebar **Refresh** button. No polling. |
| Zustand store `areaRequirements` | 48 rows per non-Margin area: `requirement`, `contracted`, `constrained`. Entered by hand on the Requirements tab and synced to Firestore (`config/area_requirements`). | Loaded once on mount, then live as operators edit. |
| `tweaks.reservePct` (local state in `page.tsx`) | TR2 reserve multiplier for Margin. Default 10. | Live. |
| `src/config/constraintFixtures.ts` (used by `ConstraintsTile`) | **Fixture** transmission-constraint forecasts (flow vs limit per SP). It uses a 4h run when the window is 8 SPs or fewer, otherwise a 24h run, anchored to the current SP. | Re-anchored every 60s. |

The existing areas are Margin, Recovery Reserve, Freq. Control Reserve, General Reserve, Contingency Reserve, Response, Inertia and Voltage.
- Each area is a requirement plus availability per slot. Gap = `avail − req`, and negative means short (`computeAreaStatus` in `src/utils/areaAggregates.ts`).
- There is **no direction split**: there is no downward margin and no +/− reserve.
- There are **no response sub-products**: no LF/HF and no pre-/post-fault. There is one `response` series.

**Time base:** `SettlementPeriodData.startTime` is built by `spToStartTime(actualSp, date)`. That treats the Elexon SP number as if it were UTC. Elexon SPs are actually numbered per local (Europe/London) settlement day, which is the documented BST issue in CLAUDE.md.

## Mapping table

| Dashboard 2 area | Source | Source field(s) | Transformation | Notes / gaps |
|---|---|---|---|---|
| **+ve MARGIN** | real | `sp.emx`, `sp.demand`, `areaRequirements.general_reserve[slot].requirement`, `reservePct` | `available = emx`. `requirement = demand × (1 + reservePct/100) + generalReserveReq`. Headroom = `available − requirement`. | This is the same formula as the existing Margin tile and sparkline (`computeAreaStatus`). The value includes committed drafts, because `emx` is recomputed on commit. |
| **−ve MARGIN** | mock | `mock-data.json → areas.negMargin` | Offsets are anchored to the current SP. | There is no downward requirement anywhere in the app. `eol − emi` could proxy downward availability, but with no requirement to compare against, the mapping isn't meaningful. |
| **CONSTRAINTS** | real (existing fixture) | `buildDemo4hRuns(now).current` when nSP ≤ 8, otherwise `buildDemo24hRun(now)`. Banding via `bandForUtilisation`. | Per constraint per SP: `active`/`activeSevere` (util > 100%) maps to **violated**, `near` (95–100%) to **tight**, `within` to ok. SPs with no constraint data are left out, so they render as a gap. | This is the **same data the existing ConstraintsTile shows**, but that source is itself a dummy fixture. The legend therefore lists CONSTRAINTS under "Mock data". The fixture has no actions, so the row shows **no action markers** (`actionsSource: 'none'`). The fixture only covers the next 4h or 24h from now, so anything beyond that is a gap. |
| **INERTIA** | real | `sp.areaAvailability.inertia`, `areaRequirements.inertia[slot].requirement` | `available = areaAvailability.inertia`. `requirement = row.requirement`. A slot with no requirement row is left out (gap). | `available` is `max(0, contracted − constrained) + Σ committed units × 0.05`, which is the prototype formula. The requirement is whatever operators entered on the Requirements tab, and is 0 by default. |
| **RESERVE** | real | `areaAvailability[x]` and `areaRequirements[x][slot].requirement` for x ∈ `recovery_reserve`, `freq_control_reserve`, `general_reserve`, `contingency_reserve` | One item per reserve type. Per SP: requirement ≤ 0 is ok; `avail < req` is **violated**; `avail − req < STRIP_TIGHT_MW.reserve` is **tight**; otherwise ok. | There are 4 items, all upward. The source has no +/− direction. Actions (▼ unusable / ▲ allocated) have no source anywhere, so the row shows **no action markers** (`actionsSource: 'none'`). |
| **RESPONSE** | real | `areaAvailability.response`, `areaRequirements.response[slot].requirement` | Same item-state rule, with `STRIP_TIGHT_MW.response`. | There is **1 item** ("Response"). The source has no LF/HF or pre/post-fault split. No action markers (`actionsSource: 'none'`). |
| **LARGEST LOSS** | mock | `mock-data.json → areas.largestLoss` | Offsets are anchored to the current SP. | The app has no securable-loss or credible-loss data. |
| **INTERCONNECTORS** | real | `sp.pn[bmUnit]` for every BMU id starting with `I_` | `netPositionMw = Σ pn` over `I_*` BMUs (+ is import to GB). The SP before the window is included when the store has it. | **Checked against Elexon:** on 2026‑10‑13 the Σ of `I_*` PN for SP 20/30/40 was −1,327 / −3,808 / +1,862 MW. The `INTOUTHH` outturn was −1,322 / −3,706 / +1,930 MW, so the sign and magnitude are right. Interconnectors are in `FETCH_EXCLUDED_FUEL_TYPES`, which only filters reference units. PN is unfiltered. Unconfirmed slots carry D‑1 PN, the same as the rest of the app; their bars are drawn faded ("IC estimate" in the legend), and no swing is computed across a seam (see **Interconnector seams** below). In offline/mock-PN mode there are no `I_*` units, so the row shows **No data**. |
| *(Voltage)* | n/a | n/a | n/a | Voltage is in the existing dashboard but has no Dashboard 2 row. It isn't shown. |

## Time conversion

- **Store slots to UTC SP starts:** the real adapters do **not** use `sp.startTime` as-is. They re-derive the true UTC start from `settlementDate` plus the real Elexon SP: `realSp = (HH·60 + MM)/30 + 1`, taken from the `startTime` that `spToStartTime` wrote. The formula is `startUtc = londonMidnightUtc(settlementDate) + (realSp − 1) × 30 min` (`settlementSpStartUtc` in `time.ts`).
  - This puts real data on the correct instant during BST.
  - The switch is `CORRECT_ELEXON_SP_TO_UTC` in the config.
  - Side effect: during BST the store's first slot falls 1h before now. That slot supplies the SP before the window for the IC swing, but the last hour of a 24h window has no data and renders as a gap.
- **Window filter:** the adapters return only SPs with `window.start ≤ spStart < window.end`. Interconnectors also get the SP before the window.
- **Resolution:** all sources are already 30-minute, so no resampling is needed. A missing slot is left out of `periods`, so it renders as a gap and is never turned into a zero.
- **Constraints fixture** timestamps are already true UTC (`floorToSpMs(now)`), so they're used as-is.

## Known issue: the two dashboards show times an hour apart during BST

The existing app labels Elexon settlement periods as if they were UTC (`spToStartTime`), but Elexon numbers SPs from **Europe/London** midnight. Dashboard 2 re-derives the true instant (see *Time conversion* above). The existing tabs are deliberately unchanged.

During British Summer Time (late March to late October) this has two visible effects when comparing the tabs:

- **Labels:** the existing app shows SP *n* as `(n−1)×30 min` and calls it **UTC**. Those digits are really the **London** start time. For example, SP 39 on 14 Oct is labelled "19:00 UTC", but it starts at 19:00 London, which is 18:00 UTC. Dashboard 2 shows the same SP at 19:00 London, so the digits match but the existing app's "UTC" is an hour off.
- **Window / current period:** the existing app picks the current SP from the UTC clock (`dateToSp(now)`). Its rolling window therefore starts about **an hour behind real time**. At 17:55 London, the existing tabs start at the slot labelled "16:30" (sidebar: "16:30 → 16:00 UTC"), while Dashboard 2 starts at 17:30 London with Now at 17:55. The existing tabs' first hour is already in the past, and Dashboard 2 has no data for the last hour of its 24h view.

In GMT the two tabs agree. This is the BST issue already listed in CLAUDE.md. Fixing it in the shared `settlements.ts` would change every existing screen, so it is out of scope here.

## Interconnector seams

`fetchAllData` fills each slot from one of two sources:

- **Confirmed** (`hasConfirmedPn = true`): Elexon PN for that slot's own settlement date and SP.
- **Estimate** (`hasConfirmedPn = false`): the D‑1 proxy, which is `yesterdayDate`'s PN **for the same SP number**. This applies to today's unconfirmed slots *and* to every slot on tomorrow's date.

A swing (`net[b] − net[b−1]`) is only meaningful when both values describe consecutive SPs. Two boundaries break that:

1. **The confirmed → estimate frontier.** For example, at 16:55 UTC on 2026‑10‑14 the last confirmed slot was SP38 (18:30 London) at −1,152 MW, and the first estimate was SP39 (19:00), taken from 13 Oct SP39, at +1,862 MW. The **+3,014 MW "swing" at 19:00 was this seam**, not a real flow change.
2. **Local midnight inside the estimates.** Today's SP48 comes from yesterday's SP48 (+33 MW), but tomorrow's SP1 comes from yesterday's SP1 (−4,772 MW). That's a wrap back to the *start* of the same day. The **−4,805 MW "swing" at 00:00 was this seam**.

**Handling:**
- Each real IC period carries `estimated` and `sourceStart`, the instant its value actually describes. For an estimate that's `settlementSpStartUtc(yesterdayDate, sp)`, where `yesterdayDate` is the store's first slot date − 1.
- `icSwings` (`derive.ts`) skips a boundary when the estimated flags differ, or when the two `sourceStart`s are not exactly one SP apart.
- A skipped boundary renders as a gap (no bar) and is excluded from "largest swing".
- Swings between two estimates that are consecutive in their source data are kept, but drawn at 40% opacity. Mock data has no source info and is treated as continuous.

## Refresh cadence

The existing dashboard has no polling: the store only changes when data is loaded, Refresh is pressed, a draft is committed or a requirement is edited. Dashboard 2 therefore:
- uses the spec default of a **30s poll**;
- **refetches immediately** when the store's `settlementPeriods` or `areaRequirements` change, or when `reservePct` changes;
- sets `forecastRunAt` for real data to the time the last store data load finished (`isLoading` true → false). This is tracked by a module-level store subscription in `data/realAdapters.ts`.

## Assumptions

1. **Real margin requirement includes General Reserve.** This copies the existing dashboard's Margin tile, not MarginChart's pure TR2. If the chart's definition is wanted, drop the `generalReserveReq` term in `realAdapters.ts`.
2. **Requirement ≤ 0 means "nothing required".** A strip item with requirement ≤ 0 is ok, and line rows only colour the worst value amber when the requirement is > 0. This follows the existing `computeAreaStatus` rule (`worstReq > 0 && …` for tight). Without it, the default all-zero requirements would paint every reserve cell amber.
3. **Strip tight thresholds** are new placeholders in `dashboard.config.ts` (`STRIP_TIGHT_MW`: reserve 100 MW, response 50 MW). The store's `areaThresholds` ("Dashboard sparkline threshold") is not used. The existing dashboard receives it but doesn't read it either.
4. **A missing requirement row is a gap.** A slot missing from `areaRequirements[area]` is left out. A slot whose row exists with value 0 is plotted.
5. **No action markers on real rows by default.** Each strip row has `actionsSource: 'none' | 'mock'` in `AREA_CONFIG`. Overlaying mock-data.json actions onto real (or fixture) cell states would claim actions that never happened, so every row defaults to `'none'`. If a row is set to `'mock'`, its actions only land on SPs that have real data, and the legend note lists it as "<ROW> actions". A row whose whole source is mock keeps its own mock actions, because those are consistent with its mock states.
6. **The constraints fixture counts as mock in the legend**, because the existing source is dummy data. It still goes through the same builder as the ConstraintsTile, so the two dashboards agree.
7. **Historical mode:** if historical data has been loaded, the store holds past slots. Real areas then show data only when a custom range covers those times. Preset windows show gaps for real areas.
8. **Estimated IC swings still count towards "largest swing"** (only seams are excluded). When the largest swing comes from estimated data, the worst-value sub line reads "largest swing (est.)".
9. **The constraint fixture choice follows the existing tile's rule** (4h fixture for ≤ 8 SPs, 24h fixture otherwise). Switching between 2h/4h and 8h+ therefore changes the constraint picture, exactly as it does on the existing dashboard.
