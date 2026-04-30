# Modelling Framework — Overview

## What This Is

A browser-based decision-support prototype for GB electricity system operators performing **unit commitment planning**. The app helps operators identify and close **margin deficits** in the national generation fleet by allowing them to model (i.e. commit) additional generation units and see the impact on system margin in real time.

All data is fetched client-side from the public [Elexon Insights API](https://data.elexon.co.uk). No backend, no authentication, no database.

---

## Core Concept: What Is Margin?

In GB electricity balancing, **margin** is the headroom between the maximum export capability of committed generation and national demand:

```
Margin = EMX − Demand
```

Where:
- **EMX** (Expected Maximum eXport) — the sum of Maximum Export Limits (MELs) for all committed generation units
- **Demand** — the national demand forecast in MW

A **positive margin** means there is spare committed capacity above demand. A **negative margin** (deficit) means there is not enough committed generation to meet demand, and the operator needs to bring additional units online.

The app also tracks:
- **EOL** (Expected Operating Level) — where units are actually expected to generate (sum of Physical Notifications + any modelled output)
- **EMI** (Expected Minimum Import/generation) — the floor of committed generation (sum of Stable Export Limits)

---

## The 48 Settlement Periods

The GB electricity market operates in **settlement periods (SPs)** of 30 minutes each. A full settlement day runs SP 1 through SP 48:

| SP | Start time | SP | Start time |
|----|------------|----|------------|
| 1  | 00:00      | 25 | 12:00      |
| 2  | 00:30      | 26 | 12:30      |
| … | …          | … | …          |
| 24 | 11:30      | 48 | 23:30      |

The app always views **tomorrow's settlement date** by default (configurable via the date picker). All chart and grid data covers all 48 SPs for the selected date.

---

## What Is Fetched from Elexon

All requests go to `https://data.elexon.co.uk/bmrs/api/v1` (proxied through Next.js rewrites to avoid CORS). No API key is required — these are public endpoints.

### 1. BM Unit Reference Data

**Endpoint:** `GET /reference/bmunits/all`

Returns all ~2,900 Balancing Mechanism (BM) units registered on the GB transmission system. Each unit has:
- `nationalGridBmUnit` — the NGESO identifier (e.g. `DRAXX-1`)
- `elexonBmUnit` — the Elexon identifier (e.g. `T_DRAXX-1`); used as the primary key
- `fuelType` — e.g. `CCGT`, `NUCLEAR`, `COAL`, `HYDRO`, `WIND`
- `generationCapacity` — registered capacity in MW (as a decimal string)
- `gspGroupId` — Grid Supply Point group (e.g. `_K` = South Wales)

**Filtering applied:** Non-dispatchable and interconnector fuel types are excluded:
`WIND`, `SOLAR`, `INTNEM`, `INTFR`, `INTIRL`, `INTEW`, `INTNED`, `INTIFA2`, `INTELEC`

Only dispatchable thermal/hydro/storage units remain: `CCGT`, `NUCLEAR`, `COAL`, `OIL`, `HYDRO`, `OCGT`, `BIOMASS`, `PS` (pumped storage), `OTHER`.

### 2. Dynamic Parameters (per BM Unit)

Five separate endpoints fetched in parallel, using a ±7-day time window around today to get current registered values:

| Parameter | Endpoint | Field | Unit | Description |
|-----------|----------|-------|------|-------------|
| SEL | `GET /datasets/SEL` | `level` | MW | Stable Export Limit — minimum stable generation output |
| SIL | `GET /datasets/SIL` | `level` | MW | Stable Import Limit — for pumping/importing units |
| NDZ | `GET /datasets/NDZ` | `notice` | seconds → converted to **minutes** | Notice to Deviate from Zero — time needed to move from zero output |
| MNZT | `GET /datasets/MNZT` | `periodMin` | minutes | Minimum Non-Zero Time — minimum time a unit must run once started |
| MZT | `GET /datasets/MZT` | `periodMin` | minutes | Minimum Zero Time — minimum time a unit must be off before restarting |

Where multiple entries exist for a unit (e.g. historic parameter changes), the most recently published entry is used.

Not all units have all parameters declared — grid columns show **N/A** when a parameter is absent.

### 3. National Demand Forecast

**Endpoint:** `GET /forecast/demand/total/day-ahead`

ENTSO-E B0610 day-ahead total load forecast. Returns one entry per settlement period with:
- `settlementDate` — YYYY-MM-DD
- `settlementPeriod` — 1–48
- `quantity` — forecast demand in MW

This is the **demand line** on the chart and the denominator in the margin calculation.

### 4. Physical Notifications (PN)

**Endpoint:** `GET /datasets/PN?settlementDate=YYYY-MM-DD&settlementPeriod=N`

A Physical Notification is a unit's declared output plan for a settlement period. **Both `settlementDate` and `settlementPeriod` are required parameters**, so the app makes **48 parallel requests** (one per SP) to cover the full day.

Each entry returns:
- `bmUnit` — Elexon unit ID
- `levelFrom` / `levelTo` — MW at start and end of the period (averaged to get a single value)

PN data is used to determine which units are **already committed**: a unit with PN > 1 MW in any SP is considered operationally committed and is excluded from the "available units" grid.

### 5. Maximum Export Limit (MELS)

**Endpoint:** `GET /datasets/MELS?from=...&to=...`

The Maximum Export Limit declares the maximum MW a unit can export in a given period (a physical ceiling, not a target). Fetched for the full day in a single request.

Fields: `bmUnit`, `settlementPeriod`, `levelFrom`, `levelTo` (averaged).

MELS data feeds the **EMX calculation**: for each committed unit in each SP, its MEL is summed to give total committed capacity.

> Note: The dataset code is `MELS` (not `MEL`) in the Elexon API.

### 6. Minimum Import Limit (MILS)

**Endpoint:** `GET /datasets/MILS?from=...&to=...`

The Minimum Import Limit (or minimum export floor for some units). Used as a fallback minimum when a unit has no declared SEL, contributing to the **EMI calculation**.

> Note: The dataset code is `MILS` (not `MIL`) in the Elexon API.

### Mock Data Fallback

If any Elexon endpoint is unavailable (network error, non-200 response, empty data), the app automatically falls back to **pre-computed mock data** and logs a `console.warn`. The mock contains:
- 50 BM units across realistic fuel types (CCGT, NUCLEAR, COAL, HYDRO, OIL, BIOMASS, OCGT, PS)
- Sinusoidal demand profile (~33,000–38,000 MW)
- ~70% of units in a "committed" state
- Realistic SEL and NDZ values

Mock data is stable within a browser session (computed once at module load, not on each re-fetch).

---

## How the App Calculates Margin

For each of the 48 settlement periods, the app computes four national aggregates:

```
EMX    = Σ MEL for all committed units (original PN > 1 MW + any modelled units)
EOL    = Σ PN for originally committed units + Σ modelled output levels
EMI    = Σ SEL (or MIL if no SEL) for all committed units
Margin = EMX − Demand
```

A unit is **committed** if:
- It has a Physical Notification > 1 MW in that SP (originally committed), **OR**
- The operator has applied a modelling action covering that SP

These aggregates are recalculated instantly in the browser whenever the operator applies or clears modelling actions — no server round-trip needed.

---

## User Interface

### Header Bar

- **Title** — "Modelling Framework — Margin Analysis"
- **Settlement date picker** — defaults to tomorrow. Changing the date clears all modelling and re-fetches data for the new date automatically.
- **Refresh button** — re-fetches data for the current date (clearing any modelling actions first).

### Margin Analysis Chart

A Recharts `ComposedChart` spanning the full width of the page showing all 48 settlement periods.

| Series | Colour | Meaning |
|--------|--------|---------|
| Demand | Dark grey (solid) | National demand forecast |
| EMX | Green (solid) | Total committed capacity ceiling |
| EOL | Blue (solid) | Where committed units are expected to generate |
| EMI | Grey dashed | Minimum committed generation floor |
| Surplus margin | Green shaded area | EMX above demand |
| Deficit margin | Red shaded area | EMX below demand |

X-axis is labelled every 2 hours (SP 1, 5, 9 … 45 → 00:00, 02:00, 04:00 … 22:00). A tooltip on hover shows exact MW values for all five series at that SP.

**The chart updates in real time** when modelling actions are applied or cleared.

### Modelling Controls Bar

Between the chart and the unit grid. Used to apply modelling actions to selected units.

| Control | Description |
|---------|-------------|
| From SP | Start of the period range to model (SP 1–48) |
| To SP | End of the period range (must be ≥ From SP) |
| Output Level (MW) | Defaults to the lowest SEL among selected units (or 100 MW if unknown) |
| Reason Code | `MARGIN` / `INERTIA` / `VOLTAGE` / `CONSTRAINT` / `RESERVE` |
| Model Selected Units | Applies the action to all checked rows; disabled if nothing is selected |
| Clear All Modelling | Removes all modelling actions and resets the chart to baseline |

The output level field auto-populates with the lowest SEL of the selected units when you first check a unit in the grid. You can override it manually — the field will not reset unless your selection drops to zero and you re-select.

### Unit Selection Grid (AG Grid)

Shows all **available but not currently committed** dispatchable BM units — i.e. units that have MEL > 0 but PN ≈ 0. These are candidates to be modelled.

| Column | Description |
|--------|-------------|
| ☑ | Checkbox — select units to model |
| BMU ID | Elexon BM unit identifier (e.g. `T_DRAXX-1`) |
| Fuel Type | `CCGT`, `NUCLEAR`, `COAL`, etc. |
| Cap (MW) | Registered capacity |
| MEL (MW) | Maximum Export Limit (max across all 48 SPs) |
| PN (MW) | Current Physical Notification (max across all 48 SPs) |
| Inc. MW | Incremental capacity = MEL − PN (default sort: descending) |
| SEL (MW) | Stable Export Limit — minimum stable output |
| NDZ (min) | Notice to Deviate from Zero |
| MNZT (min) | Minimum Non-Zero Time |
| GSP Group | Grid Supply Point group code |

- **Default sort:** Incremental MW descending — highest-gain units at the top
- **Modelled units** are highlighted in light blue
- All columns support sorting, filtering, and resizing
- Already-committed units (PN > 1 MW) are excluded — they are already counted in EMX

---

## Typical Workflow

1. **Open the app** — data for tomorrow loads automatically. If the Elexon API is reachable, live data is shown; otherwise mock data is used.

2. **Review the chart** — identify settlement periods where margin is negative (red shading). Note which time periods are most constrained.

3. **Sort the grid by Inc. MW** (default) — the units at the top offer the most incremental capacity.

4. **Review unit parameters** — check NDZ (how long to start), MNZT (how long it must run), SEL (its minimum stable output once running), and GSP Group (location).

5. **Select one or more units** — tick the checkbox(es). The Output Level field pre-fills with the lowest SEL of selected units.

6. **Set the period range** — choose From SP and To SP to cover the deficit window identified in the chart.

7. **Adjust output level if needed** — override the default if you want to model the unit at a different output.

8. **Choose a reason code** — `MARGIN` for covering a generation deficit; use `INERTIA`, `VOLTAGE`, `CONSTRAINT`, or `RESERVE` for other system needs.

9. **Click "Model Selected Units"** — the chart updates immediately. The modelled units turn blue in the grid and their MEL now counts toward EMX. Check whether the deficit is closed.

10. **Iterate** — add more units, adjust periods, or try different output levels until the margin profile is satisfactory.

11. **Clear All Modelling** to reset and start over, or change the date to view a different day.

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx              — Root HTML layout (title, global CSS)
│   ├── page.tsx                — Main page: data loading, component composition
│   └── globals.css             — Tailwind import, html/body height
├── components/
│   ├── Header.tsx              — Title bar, date picker, refresh button
│   ├── MarginChart.tsx         — Recharts ComposedChart (demand/EMX/EOL/EMI/margin)
│   ├── ModellingControls.tsx   — From/To SP, output level, reason code, action buttons
│   └── UnitGrid.tsx            — AG Grid Community table of available units
├── models/
│   └── types.ts                — BMUnit, SettlementPeriodData, ModellingAction interfaces
├── services/
│   └── elexon.ts               — All Elexon API fetch functions + mock fallback
├── store/
│   └── useModellingStore.ts    — Zustand store (units, SPs, actions, selection, loading)
└── utils/
    ├── fuelTypes.ts            — Shared EXCLUDED_FUEL_TYPES set
    ├── margin.ts               — EMX/EOL/EMI/Margin calculation functions
    └── settlements.ts          — SP ↔ time conversion helpers
```

---

## Tech Stack

| Package | Version | Purpose |
|---------|---------|---------|
| Next.js | 16.2 | App framework (app router, API proxy rewrites) |
| React | 19 | UI rendering |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 4 | Utility-first styling |
| Recharts | 3.8 | Margin analysis chart |
| AG Grid Community | 35 | Unit selection grid |
| Zustand | 5 | Client-side state management |

---

## Known Limitations and Next Steps

- **No test suite** — unit tests for margin calculation logic and component behaviour are recommended before production use.
- **PN requires 48 API calls** — one per settlement period. This is a constraint of the Elexon `/datasets/PN` endpoint which requires both `settlementDate` and `settlementPeriod`. Investigating whether `/balancing/physical` with a date range is feasible would reduce this to a single call.
- **BST offset** — `spToStartTime` uses UTC (`Z` suffix). During British Summer Time (late March – late October), SP 1 actually starts at `T23:00Z` the prior calendar day. The `startTime` field is currently informational only and does not affect calculations.
- **Inc. MW approximation** — the grid shows MEL and PN as the maximum across all 48 SPs. For units with variable profiles, the subtraction is an approximation of incremental capacity, not a per-SP value.
- **No export** — modelling actions are in-memory only. A future version could export the action list as CSV or push to a downstream system.
