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
| **INTERCONNECTORS** | real | `sp.pn[bmUnit]` for every BMU id starting with `I_` | `netPositionMw = Σ pn` over `I_*` BMUs (+ is import to GB). The SP before the window is included when the store has it. | **Checked against Elexon:** on 2026‑10‑13 the Σ of `I_*` PN for SP 20/30/40 was −1,327 / −3,808 / +1,862 MW. The `INTOUTHH` outturn was −1,322 / −3,706 / +1,930 MW, so the sign and magnitude are right. Interconnectors are in `FETCH_EXCLUDED_FUEL_TYPES`, which only filters reference units. PN is unfiltered. Unconfirmed slots carry D‑1 PN, the same as the rest of the app. In offline/mock-PN mode there are no `I_*` units, so the row shows **No data**. |
| *(Voltage)* | n/a | n/a | n/a | Voltage is in the existing dashboard but has no Dashboard 2 row. It isn't shown. |

## Time conversion

- **Store slots to UTC SP starts:** the real adapters do **not** use `sp.startTime` as-is. They re-derive the true UTC start from `settlementDate` plus the real Elexon SP: `realSp = (HH·60 + MM)/30 + 1`, taken from the `startTime` that `spToStartTime` wrote. The formula is `startUtc = londonMidnightUtc(settlementDate) + (realSp − 1) × 30 min` (`settlementSpStartUtc` in `time.ts`).
  - This puts real data on the correct instant during BST.
  - The switch is `CORRECT_ELEXON_SP_TO_UTC` in the config.
  - Side effect: during BST the store's first slot falls 1h before now. That slot supplies the SP before the window for the IC swing, but the last hour of a 24h window has no data and renders as a gap.
- **Window filter:** the adapters return only SPs with `window.start ≤ spStart < window.end`. Interconnectors also get the SP before the window.
- **Resolution:** all sources are already 30-minute, so no resampling is needed. A missing slot is left out of `periods`, so it renders as a gap and is never turned into a zero.
- **Constraints fixture** timestamps are already true UTC (`floorToSpMs(now)`), so they're used as-is.

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
8. **The constraint fixture choice follows the existing tile's rule** (4h fixture for ≤ 8 SPs, 24h fixture otherwise). Switching between 2h/4h and 8h+ therefore changes the constraint picture, exactly as it does on the existing dashboard.
