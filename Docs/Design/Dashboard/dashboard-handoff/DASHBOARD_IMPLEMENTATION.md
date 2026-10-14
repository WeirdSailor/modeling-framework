# Cross-Area Operational Awareness Dashboard: Implementation Spec

**Audience:** Claude Code, implementing this inside the existing Scheduling prototype.
**Status:** Design approved for prototype build. Data is mocked; real feeds come later.

## 0. How to use this document

1. Read the whole document before writing code.
2. **Inspect the existing prototype repo first.** Match its framework, language, styling approach, folder structure, state management and lint rules. Do not introduce a new framework or UI kit. If the repo is React + TypeScript, follow the component structure in section 13 as written. Otherwise, translate it into the equivalent idioms.
3. Reference files shipped with this spec:
   - `reference-mockup.jpg`: the approved visual. Match it closely.
   - `reference-mockup.html`: a static, throwaway mockup that produced the JPG. Use it **only** to read exact colours, sizes and SVG construction. Do not copy its code structure: it is a single script with hard-coded data and no component model.
   - `mock-data.json`: the mock scenario at settlement-period resolution (section 11).
4. Where this spec and the reference HTML disagree, **this spec wins**.
5. Anything marked **[DECISION]** is a default chosen for the prototype. Implement it as specified, but keep it easy to change (config or a single constant).

---

## 1. Purpose

Control-room schedulers need one screen that answers **"when, where and how bad"** across all operational areas for the hours ahead. Every area sits on one shared time axis, so problems at the same time line up vertically.

Users are highly qualified NESO operators. The UI is deliberately sparse: no explanatory text, no units on screen (units live in config for later tooltips), and no decoration.

## 2. Scope

### In scope (this build)

- Top bar with the horizon selector and data status.
- The dashboard panel: time axis header, 8 area rows, legend.
- Three row types: **line**, **strip** and **interconnector (IC)**.
- Shared time scale, Now line, and a hover cursor synced across all rows.
- Horizon presets 2h / 4h / 8h / 12h / 24h, with **12h selected by default**.
- **Custom** range: date-time from/to picker (see 9.3). The picker may be a minimal implementation, but the view state it produces must be fully supported.
- Mock data provider behind a typed interface, with polling.
- Click on a strip cell or chart point emits an `onDrillDown` event (a console log or no-op handler is fine for now).

### Out of scope (do not build)

- Tooltips: leave a clear extension point (section 9.4) but render none.
- Drill-down screens.
- Summary strips, KPI tiles, status icons, action queues or alert lists. These were explicitly removed during design review. **Do not add them back.**
- Edit or layout mode, and panel add, remove or reorder.
- Real data integration.

## 3. Layout

Reference viewport: 1920px wide. The layout must be fluid down to 1440px wide (the chart column flexes; everything else is fixed).

```
┌ Top bar (56px) ─────────────────────────────────────────────────────────────┐
│ [2h|4h|8h|12h|24h|📅 Custom]                  ● Live │ Forecast run 14:15 │ Updated 14:25:00 (12s ago) │
└─────────────────────────────────────────────────────────────────────────────┘
  16px gap
┌ Dashboard panel (margin 0 24px, radius 10px, 1px border) ───────────────────┐
│ Header row 34px: [ empty left cell 320px ][ time axis ]                     │  ← border-bottom
│ +ve MARGIN            −670 │ line chart                                     │
│                   req 32,000│                                                │
│ −ve MARGIN            +950 │ line chart                                     │
│ CONSTRAINTS          2 SPs │ strip                                          │
│ INERTIA                 +4 │ line chart                                     │
│ RESERVE              2 SPs │ strip                                          │
│ RESPONSE      2 SPs tight  │ strip                                          │
│ LARGEST LOSS           +60 │ line chart                                     │
│ INTERCONNECTORS     2.3 GW │ IC bars                                        │
│ Legend row                                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Grid: `grid-template-columns: 320px 1fr`.
- **No horizontal divider lines between area rows.** The only horizontal rule is under the header row.
- The left column has a 1px right border (`--line`).
- Row heights: line rows **84px**, strip rows **62px**, IC row **96px**, header **34px**.
- All rows share **exactly** the same chart x-range: the left and right pixel edges must align to the pixel across every row and the axis.

## 4. Design tokens

Dark theme only for this build.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0D1117` | Page background |
| `--topbar` | `#0A0E13` | Top bar background |
| `--panel` | `#151A21` | Dashboard panel |
| `--panel2` | `#1A2028` | Header row |
| `--line` | `#262E39` | Borders |
| `--line2` | `#323B48` | Control borders, separators |
| `--text` | `#E7EBF0` | Primary text, Now line |
| `--muted` | `#8C97A7` | Secondary text, requirement line |
| `--head` | `#D3DCE7` | Data line stroke |
| `--crit` | `#FF6B4A` | Violated / short |
| `--warn` | `#F2B53C` | Tight / amber |
| `--ok` | `#5AA9E6` | Live dot, positive headroom fill base |
| `--cursor` | `#9AA6B8` | Cursor dotted line |
| `--grid-hour` | `#28313D` | Vertical grid on the hour |
| `--grid-half` | `#1E252F` | Vertical grid on the half hour |
| `--cell-ok` | fill `#1F2630`, stroke `#2A323D` | Strip cell, OK |
| `--cell-managed` | fill `#2C3746`, stroke `#5B6B82` | Strip cell, managed by actions |
| `--cell-tight` | fill `rgba(242,181,60,.30)`, stroke `rgba(242,181,60,.85)` | Strip cell, tight |
| `--cell-violated` | hatch fill, stroke `rgba(255,107,74,.9)` | Strip cell, violated |
| `--past-shade` | `rgba(255,255,255,.035)` | Part of the window before Now |

**Hatch pattern** (shortfall areas and violated cells): SVG `<pattern>`, 7×7 user units, `patternTransform="rotate(45)"`, background `rgba(255,107,74,.22)`, one 2px stripe `rgba(255,107,74,.8)`. Define it once per page (shared `<defs>`), not per row.

**Typography:** Inter (fall back to the repo's font if Inter isn't available), with `font-feature-settings: "tnum" 1` on everything so numbers align.

| Element | Size / weight |
|---|---|
| Area name | 17px / 600, letter-spacing .3px |
| Worst value (big) | 20px / 700 |
| Worst value (sub line) | 12px / 400, `--muted` |
| Axis labels | 11.5px / 400, `--muted` |
| Axis badges (Now, cursor, midnight) | 11.5px / 600 to 700 |
| Chart value labels | 11.5px / 600 |
| Strip cell numbers | 12px / 600, `#F2F5F8` |
| Top bar | 13px |
| Legend | 12px, `--muted` |

**Number formatting:** `en-GB` thousands separators. Use a real minus sign `−` (U+2212), never a hyphen. Show an explicit `+` on positive headroom values. No units on screen.

## 5. Time model

Get this right first: everything else depends on it.

### 5.1 Settlement periods

- Data resolution is the **settlement period (SP) = 30 minutes**.
- Build the timeline from **UTC instants**, and display in **Europe/London**.
- **Clock-change days have 46 or 50 SPs.** Never assume 48 per day, and never compute times as `midnight + n × 30 min` in local time. Iterate in UTC, in 30-minute steps.
- SP numbering (if shown anywhere later) is per local settlement day, starting at SP1 = 00:00 to 00:30 local. It isn't displayed in this build.

### 5.2 Window

- **Preset horizons (2h, 4h, 8h, 12h, 24h):**
  - `windowStart` = start of the SP containing Now.
  - `windowEnd` = `windowStart + horizon`.
  - For example, at 14:25 with 12h selected, the window is 14:00 to 02:00 (24 SPs).
- **Roll-over:** when Now crosses into a new SP, the window rolls forward one SP automatically.
- **Custom:** `windowStart` and `windowEnd` come from the picker, snapped to SP boundaries (round the start down and the end up). The window does not roll. See 9.3.

### 5.3 Shared x-scale

- One linear scale maps `[windowStart, windowEnd] → [0, chartWidth]`, shared by the axis and every row. Recompute it on resize (`ResizeObserver` on the chart column).
- `spWidth = chartWidth / nSP`.
- **SP-level data points are plotted at the SP midpoint.** The one exception is IC swings, which are plotted on SP boundaries (section 8.3).

### 5.4 Now

- Re-evaluate Now every **30 seconds** (configurable).
- **Now line:** solid 1.5px `--text`, full height of every row, drawn **on top of everything** in each row (after cells, bars, lines and labels).
- **Past shading:** the part of the window from `windowStart` to Now gets `--past-shade`, drawn behind the content in every row and in the axis header.
- **Now badge** in the axis: a white pill (`--text` fill, dark text, 700 weight) reading `Now HH:MM`, centred on the Now x-position.
- If Now is outside the window (custom range), hide both the Now line and the badge.

## 6. Data contract

Define these types in the repo's types location. Names are suggestions; keep the shape.

```ts
type ISO = string;                 // UTC ISO-8601 instant
type SpState = 'ok' | 'tight' | 'violated';

interface DashboardData {
  forecastRunAt: ISO;              // time of the forecast run the data came from
  updatedAt: ISO;                  // time this payload was produced
  window: { start: ISO; end: ISO };
  areas: AreaData[];               // order is irrelevant; display order comes from config
}

type AreaData = LineAreaData | StripAreaData | IcAreaData;

interface LineAreaData {
  kind: 'line';
  id: AreaId;
  periods: { spStart: ISO; requirement: number; available: number }[];
}

interface StripAreaData {
  kind: 'strip';
  id: AreaId;
  items: { id: string; name: string }[];   // constraints, or reserve/response products
  periods: {
    spStart: ISO;
    itemStates: Record<string, SpState>;   // only non-ok items need listing; missing = ok
    actions: StripAction[];                // actions already taken for this SP
  }[];
}

interface StripAction {
  direction: 'down' | 'up';  // down = capacity made unusable / output restricted; up = capacity allocated
  mw: number;                // always positive
  itemId?: string;
  description?: string;      // for future tooltips
}

interface IcAreaData {
  kind: 'ic';
  id: 'interconnectors';
  // Must include the SP immediately BEFORE window.start, so the first boundary swing can be computed.
  periods: { spStart: ISO; netPositionMw: number }[];  // + = net import to GB, − = net export from GB
}

type AreaId = 'posMargin' | 'negMargin' | 'constraints' | 'inertia'
            | 'reserve' | 'response' | 'largestLoss' | 'interconnectors';
```

**Data provider interface:**

```ts
interface DashboardDataProvider {
  fetch(window: { start: ISO; end: ISO }): Promise<DashboardData>;
}
```

- Implement `MockDashboardDataProvider` now (section 11).
- **Polling:** the view polls every **30 seconds** [DECISION, configurable].
  - Keep showing the last good data while a fetch is in flight.
  - On error, keep the last data and mark the status as stale (section 7).
- Missing SPs in a series render as a **gap**, never as zero.

## 7. Top bar

Height 56px, background `--topbar`, bottom border `--line`, horizontal padding 24px.

**Left: horizon segmented control**
- Buttons: `2h | 4h | 8h | 12h | 24h | Custom`. Custom has a small calendar icon before the label.
- Style: 1px `--line2` border, radius 6px, 13px text, padding 6px 14px.
- The selected button gets fill `#2A3442`, `--text` colour and 600 weight.
- **There is no page title.** (It was removed in review.)

**Right: data status**, in this order with 1px × 16px `--line2` separators between items:
1. **Status dot plus label.**
   - Live: 8px `--ok` dot with a 3px `rgba(90,169,230,.2)` halo, label **Live**.
   - Stale: `--warn` dot, label **Stale**. Stale means `now − updatedAt > 2 × pollInterval`, or the last fetch failed [DECISION].
   - Custom window: label **Custom range** (no live semantics).
2. `Forecast run` **`HH:MM`**
3. `Updated` **`HH:MM:SS`** `(Ns ago)`, where the relative part re-renders every second. Show seconds below 60, then `Nm ago`.

Bold parts use `--text`, weight 500; the rest is `--muted`. **There is no clock and no resolution label** (both removed in review).

## 8. Rows

### 8.0 Area config

The display order is fixed, and all thresholds and scales are config, not code.

| Order | id | Label | Kind | Scale `band` (± headroom) | `tight` threshold | Unit (config only) |
|---|---|---|---|---|---|---|
| 1 | posMargin | `+ve MARGIN` | line | 2,000 | 500 | MW |
| 2 | negMargin | `−ve MARGIN` | line | 2,000 | 500 | MW |
| 3 | constraints | `CONSTRAINTS` | strip | n/a | n/a | n/a |
| 4 | inertia | `INERTIA` | line | 40 | 6 | GVA·s |
| 5 | reserve | `RESERVE` | strip | n/a | n/a | MW |
| 6 | response | `RESPONSE` | strip | n/a | n/a | MW |
| 7 | largestLoss | `LARGEST LOSS` | line | 1,000 | 100 | MW |
| 8 | interconnectors | `INTERCONNECTORS` | ic | 3,000 | amber ≥ 1,500 · red ≥ 2,000 (absolute swing) | MW |

- **Labels:** area names are uppercase. The `+ve` / `−ve` prefixes stay lowercase (as written in the table).
- **All bands and thresholds are placeholders** for SME tuning. Put them in one config file.

### 8.1 Left column (all rows)

- Padding 0 20px. It's a flex row with `justify-content: space-between` and `align-items: center`.
- **Left side:** the area name. No status icons, no units, no description text.
- **Right side:** the worst-in-window block, right-aligned, with a big value and a sub line.

| Kind | Big value | Colour | Sub line |
|---|---|---|---|
| line | Minimum SP headroom in window, signed (e.g. `−670`, `+950`) | `--crit` if < 0; `--warn` if < `tight`; `--muted` otherwise | `req {requirement at that same SP}` (e.g. `req 32,000`). **No time.** |
| strip, any violated SP | `{n} SPs` (n = number of violated SPs) | `--crit` | `{k} constraints` / `{k} products`, where k = distinct items violated anywhere in the window (singular when k = 1) |
| strip, no violated but some tight SPs | `{n} SPs tight` | `--warn` | `{k} constraint` / `{k} products`, counting distinct items that are tight |
| strip, all OK | `OK` | `--muted` | (none) |
| ic | Largest absolute swing in window: `≥1,000` → `x.x GW`, otherwise `nnn MW` | `--crit` ≥ red threshold; `--warn` ≥ amber; `--muted` otherwise | `largest swing` |

- Sub-line nouns: constraints row → "constraint(s)"; reserve and response → "product(s)".
- **The window for worst-in-window** is the full visible window, including the current SP.

### 8.2 Line rows (+ve MARGIN, −ve MARGIN, INERTIA, LARGEST LOSS)

**What is plotted:** `headroom = available − requirement` for every SP. Below the centre line always means short, in every row:
- −ve margin plots downward availability minus downward requirement, both as positive magnitudes.
- Largest loss plots largest securable loss minus largest credible loss.

**Scale:** each area has a fixed band, centred on the requirement line, that never autoscales.
- `y(v) = midY − clamp(v / band, −1, 1) × (H/2 − 8)`.
- Values beyond the band are clamped flat to the edge.
- Rationale: a % of requirement scale hides a 670 MW margin shortfall (2% of 32 GW), and autoscaling makes depth meaningless between rows and refreshes.

**Layers, back to front:**
1. Past shading.
2. Vertical grid lines at every SP boundary: `--grid-hour` on the hour, `--grid-half` on the half hour.
3. **Positive headroom fill:** the area between the curve and the centre line, clipped to the top half, `rgba(90,169,230,.12)`.
4. **Shortfall fill:** the same area clipped to the bottom half, filled with the hatch pattern.
5. **Requirement line:** horizontal at `midY`, 1px `--muted`, dash `6 4`.
6. **Data line:** 1.8px `--head`, no fill.
7. Cursor elements (section 9.2).
8. Now line.

**Curve:** points at SP midpoints with **monotone cubic interpolation** (equivalent to `d3.curveMonotoneX`).
- Monotone interpolation doesn't overshoot, so the curve never crosses the requirement line between two SPs that are both on the same side of it.
- Don't use Catmull-Rom or basis splines.
- For the edges, extend the first and last values flat to the window edges.

### 8.3 Strip rows (CONSTRAINTS, RESERVE, RESPONSE)

There is one cell per SP. Each cell spans its SP, inset 2px horizontally and 12px top and bottom, with radius 3px.

**Cell state** = the worst `itemStates` value for that SP (violated > tight > ok).

| State | Fill / stroke |
|---|---|
| violated | hatch / `rgba(255,107,74,.9)` |
| tight | `--cell-tight` |
| ok **and** `actions.length > 0` | `--cell-managed` ("Managed by actions") |
| ok, no actions | `--cell-ok` |

A violated or tight cell can also have actions. In that case it keeps its violated or tight fill and shows the markers on top.

**Action markers:**
- **Aggregate by direction first:** sum all `down` MW and all `up` MW for the SP, so there are at most 2 markers per cell.
- **Glyphs:**
  - `down` is a solid ▼ triangle, roughly 10×9px, `#F2F5F8`.
  - `up` is a solid ▲ triangle, same size and colour.
  - Draw them as SVG polygons, not font glyphs, so they render identically everywhere.
- **Layout:**
  - **One direction:** arrow plus MW number on one line, centred in the cell (arrow about 14px left of centre, number starting about 5px left of centre).
  - **Both directions:** two lines stacked, ▼ with its number on top and ▲ with its number below (±9px from the vertical centre), with the same horizontal layout. The arrows are scaled to 0.85 when stacked.
  - **Narrow cells:** if the cell is narrower than **44px** (e.g. the 24h view), drop the numbers and keep the arrows. Below **14px**, drop the markers entirely; the fill still tells the state.
- **Semantics** (for reference; tooltips later):
  - Constraints ▼ = output already reduced by actions so the constraint isn't violated.
  - Reserve ▼ = contracted reserve made unusable because of a constraint.
  - Reserve ▲ = an unconstrained unit allocated to replace it.
- **The cursor line is drawn underneath the cells in strip rows,** so it never strikes through the numbers. The Now line is still drawn on top.

### 8.4 IC row (INTERCONNECTORS)

**What is plotted:** the change in net interconnector position between consecutive SPs, `swing[b] = net[b] − net[b−1]`. A positive swing means a move towards import to GB.

**Position:** each bar sits **on the SP boundary b** (the start of SP b), not inside a period, because the swing happens at the boundary.

**Scale:**
- Fixed ±`band` (3,000 MW), centred.
- Thin zero baseline: 1px `#56627A`.
- **No threshold lines.** (They were removed in review.)

**Bar:**
- 8px wide, centred on the boundary, radius 1.5px, from the baseline to `y(swing)`.
- Colour: `--crit` if |swing| ≥ 2,000; `--warn` if ≥ 1,500; `#7D8A9C` otherwise.

**Label:** only amber and red bars get a signed MW label (e.g. `+2,300`, `−1,600`).
- 11.5px / 600, in the bar's colour, offset 8px to the right of the bar.
- Vertically just inside the bar's end: above it for negative bars, below the top for positive bars.

**Corner captions:** 10.5px, `#6B7789`, right-aligned 6px from the right edge.
- Top right: `▲ Import to GB`.
- Bottom right: `▼ Export from GB`.

### 8.5 Header row (time axis)

- Height 34px, background `--panel2`, with a 1px `--line` bottom border.
- The left cell is **empty** (no "Area" or "Worst in window" text).

**Tick spacing**, chosen so labels are at least about 80px apart:

| Horizon | Ticks |
|---|---|
| 2h, 4h | every 30 min |
| 8h, 12h | every hour |
| 24h | every 2 hours |
| Custom | pick the smallest of these that keeps labels at least 80px apart |

**Labels:**
- Format `HH:MM`, centred on the tick.
- **Midnight** is replaced by a day badge: pill `#2A3442`, 600 weight, `--text` colour, reading `Thu 00:00` (short weekday plus 00:00).
- **Collision rule:** hide any tick label whose centre falls within 0.9 × tick-spacing of the Now badge or the cursor badge.
- Past shading applies to the header too.

**Vertical grid lines:** draw them at every SP boundary in every row (hour boundaries brighter, see 8.2). At 24h, draw only the hour lines.

### 8.6 Legend row

- Padding 12px 18px, 12px `--muted`, gap 24px, no top border.
- Items, in order, each with a small swatch:
  1. dashed line: **Requirement**
  2. hatch swatch: **Violated**
  3. tight swatch: **Tight**
  4. managed swatch: **Managed by actions**
  5. ▼: **Unusable**
  6. ▲: **Allocated**
  7. small grey bar: **IC swing**
- Use these exact words. Add nothing else; a right-aligned "Illustrative data" note is allowed while the data is mocked.

## 9. Interaction

### 9.1 Horizon switching

- Clicking a preset recomputes the window (5.2) and refetches.
- Preserve the cursor if its SP is still inside the new window; otherwise clear it.
- Persist the selected horizon in `localStorage` (wrapped in try/catch), so a refresh keeps it [DECISION].

### 9.2 Cursor (synced crosshair)

**Hover:** hovering anywhere over any row's chart area or the axis shows the cursor.
- The cursor **snaps to the SP under the pointer**.
- It is drawn as a **single** dotted vertical line at that **SP's midpoint**: 1px `--cursor`, dash `3 3`, the full height of every row and the axis.
- **There is no column highlight** (removed in review).

**Axis badge:** pill `#2A3442` fill, 1px `--cursor` stroke, `--text`, reading the SP start time `HH:MM`, centred on the cursor. **No SP number.**

**Line rows:** at the cursor, draw a point marker (circle r = 3.5, fill `--bg`, stroke `--head` 1.5px) on the curve at the SP value. Add a signed value label 7px to the right of it:
- Above the point if the value is ≥ 0 and the point is more than 20px from the top.
- Otherwise below it.
- Label colour: `#FF8A70` when negative, `#B9C3D1` otherwise.

**Pinning:**
- Clicking on the chart area **pins** the cursor at that SP. A pinned cursor stays when the pointer leaves.
- Clicking the pinned SP again, or pressing `Esc`, unpins it.
- While pinned, hovering elsewhere shows nothing extra; the cursor stays pinned [DECISION].

**Keyboard:**
- With the dashboard focused, `←` / `→` move the cursor by one SP (pinning it).
- `Home` / `End` jump to the first or last SP.

The cursor state lives in **one shared store** (a context or a single state atom). Rows read from it. Do not compute cursor state per row.

### 9.3 Custom range

- Clicking **Custom** opens a popover with **From** and **To** date-time inputs (local time, Europe/London), plus Apply and Cancel.
- **Validation:**
  - To must be after From.
  - The range must be between 1 SP and 48 hours [DECISION].
  - Values snap to SP boundaries on Apply.
- **While a custom range is active:**
  - The Custom button shows as selected.
  - The status shows **Custom range**.
  - A compact bar appears directly under the top bar: `Viewing Thu 15 Oct 18:00 to 20:00` with a **Back to live** button, which restores the previous preset.
  - The window doesn't roll.
  - Polling continues (forecasts update).
  - The Now line and badge are hidden when Now is outside the window.
- The past-dated part of a custom range (before Now) is shaded like normal past time.

### 9.4 Tooltips (extension point only)

- Don't render tooltips.
- Do expose a typed hover payload from every row, `{ areaId, spStart, kind, data }`, through the shared store, so a tooltip layer can be added later without touching row internals.

### 9.5 Drill-down event

Clicking a strip cell, an IC bar or a line-row SP emits `onDrillDown({ areaId, spStart })`. For now the handler is a no-op plus a `console.debug`.

## 10. Accessibility and robustness

- **Colour is never the only signal:**
  - Violated uses hatching.
  - Tight uses a solid fill with a stroke.
  - Managed uses a distinct neutral fill.
  - Values carry a sign.
- The colours avoid red/green pairing; keep it that way.
- Each row is a `role="group"` with `aria-label="{Area name}"`. The worst-in-window block has an `aria-label` such as `"+ve margin, worst headroom minus 670, requirement 32,000"`.
- Text contrast is at least 4.5:1 against the panel for all text, including `--muted` (already compliant: keep it if you adjust colours).
- `prefers-reduced-motion`: no animations are needed anywhere. If you add transitions, disable them under reduced motion.
- **Gaps and empty states:**
  - A missing SP is a gap in the line or an empty cell outline.
  - An area with no data at all shows `No data` in `--muted` in the value block, with an empty chart.
- **Performance:** at 24h there are 8 rows × 48 SPs, which is trivial. Still:
  - Memoise the per-row path computation on `(data, scale)`.
  - Cursor movement must not recompute paths. Keep the cursor in its own SVG layer per row, or one overlay SVG spanning all rows.

## 11. Mock data

Use `mock-data.json` (shipped alongside this spec).

**Structure:**
- Every series is keyed by **`offset`**, the SP index relative to the **current SP** (0 = the SP containing Now, −1 = the previous SP). There are 49 periods, from −1 to 47 (24h ahead).
- `MockDashboardDataProvider.fetch(window)`:
  1. Anchors offset 0 to the start of the current SP at runtime.
  2. Converts offsets to UTC `spStart` instants (UTC 30-minute steps, as in 5.1).
  3. Filters to the requested window (keeping the SP before `window.start` for interconnectors).
  4. Returns the `DashboardData` shape.
- `forecastRunAt` = Now − `forecastRunMinutesAgo`, floored to a 15-minute boundary.
- `updatedAt` = the fetch time.
- Add ±0 to 2% random jitter to line-row `available` values on each poll **only** behind a `MOCK_JITTER` flag (default off), so the default view matches the reference exactly.

**Expected result:** with the mock, at Now = 14:25 and 12h selected, the screen must match `reference-mockup.jpg`:

| Area | Worst-in-window |
|---|---|
| +ve MARGIN | −670 / req 32,000 (shortfall from the 16:30 SP to the 19:00 SP, worst 18:00) |
| −ve MARGIN | +950 / req 11,300 |
| CONSTRAINTS | 2 SPs / 2 constraints; managed ▼180 at 16:30 and ▼90 at 22:30 |
| INERTIA | +4 / req 120 (amber) |
| RESERVE | 2 SPs / 2 products; ▼150 at 17:30, stacked ▼150 ▲100 at 18:00, ▲100 at 18:30 |
| RESPONSE | 2 SPs tight / 1 product, at 23:30 and 00:00 |
| LARGEST LOSS | +60 / req 1,800 (amber) |
| INTERCONNECTORS | 2.3 GW / largest swing; red +2,300 bar at 23:00, amber −1,600 bar at 19:00 |

## 12. Configuration

Put these in one module (e.g. `dashboard.config.ts`):
- area order, labels, kinds, bands, tight thresholds and units;
- IC amber and red thresholds;
- default horizon (`12h`) and the available horizons;
- poll interval (30s), Now tick (30s), stale multiplier (2);
- custom range limits (1 SP to 48h);
- marker width thresholds (44px for numbers, 14px for markers).

## 13. Suggested component structure (React + TypeScript)

Use hand-built SVG for all charts. **Do not use a charting library** for the rows: the layout needs pixel-exact shared x alignment, custom hatching, boundary-positioned bars and stacked cell markers, and a library will fight all of that. `d3-shape` (for `curveMonotoneX`) and `d3-scale` are fine if they're already present or are small additions; otherwise implement monotone cubic by hand (Fritsch-Carlson).

```
dashboard/
  dashboard.config.ts
  types.ts
  time.ts                 # SP iteration in UTC, window calc, formatting in Europe/London
  format.ts               # signed numbers, U+2212, GW/MW
  derive.ts               # headroom, strip cell state, action aggregation, worst-in-window, IC swings
  data/
    DashboardDataProvider.ts
    MockDashboardDataProvider.ts
    mock-data.json
  state/
    useDashboardData.ts   # polling, last-good data, stale flag
    useTimeWindow.ts      # horizon / custom, roll-over, Now ticker
    cursorStore.ts        # shared hover/pin cursor + hover payload
  components/
    OperationalDashboard.tsx
    TopBar.tsx
    HorizonSelector.tsx
    CustomRangePopover.tsx
    CustomRangeBanner.tsx
    DataStatus.tsx
    TimeAxis.tsx
    AreaRow.tsx           # left column + chart slot
    WorstValue.tsx
    charts/
      LineChart.tsx
      StripChart.tsx
      IcChart.tsx
      ChartFrame.tsx      # past shade, grid, Now line, cursor layer
      SvgDefs.tsx         # hatch pattern, shared once
    Legend.tsx
```

**Unit-test `derive.ts` and `time.ts`.** These are the parts most likely to be wrong:
- clock-change days with 46 and 50 SPs;
- the window roll-over at an SP boundary;
- the worst-in-window rules;
- aggregation of actions by direction;
- the IC swing calculation using the SP before the window.

## 14. Acceptance criteria

- [ ] With mock data at 14:25 and 12h selected, the screen visually matches `reference-mockup.jpg` (layout, colours, values, markers).
- [ ] The axis, all 8 rows and the legend share identical chart left and right edges at every viewport width from 1440 to 2560px.
- [ ] There are no horizontal divider lines between area rows, no status icons, no units, no description text and no page title.
- [ ] Line rows: a fixed band per area, the requirement as a dashed centre line, a hatched shortfall below it and a blue fill above it, and the curve never overshoots across the line between same-sign SPs.
- [ ] Strip cells correctly show violated, tight, managed and OK. Markers aggregate by direction, stack when both exist, drop numbers below 44px and drop markers below 14px.
- [ ] IC bars sit on SP boundaries with correct colouring, labels only on amber and red bars, the "Import to GB" / "Export from GB" captions, and no threshold lines.
- [ ] The Now line renders above all content in every row, and the window rolls when Now crosses an SP boundary.
- [ ] The cursor snaps to SP midpoints, is a single dotted line synced across all rows and the axis, shows value labels on line rows, runs beneath strip cells, and supports pin, unpin, Esc and arrow keys.
- [ ] The custom range snaps to SPs, shows the banner with Back to live, hides Now when it's outside the window, and doesn't roll.
- [ ] The status goes to Stale after 2 missed polls or on a fetch error, while keeping the last data on screen.
- [ ] The time logic passes unit tests for both clock-change days.
- [ ] No console errors. Lint and type-check pass using the repo's existing commands.

## 15. Open questions (do not block the build)

These are for the product owner. Implement the defaults above.

1. Final scale bands and tight thresholds per area (SME input).
2. Whether the **Response** row should become a line chart (requirement vs holding) rather than a strip.
3. Tooltip content per area, and the drill-down destinations.
4. Whether to add a unit toggle for user research (units currently live in config only).
5. The custom range maximum length, and whether historical (past-only) ranges are allowed.
