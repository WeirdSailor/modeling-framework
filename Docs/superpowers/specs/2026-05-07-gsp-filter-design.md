# GSP Group Filter for Available Units Panel

**Date:** 2026-05-07
**Status:** Approved

## Overview

Add a per-zone include/exclude filter to the Available Units panel. Operators can open a popover from the toolbar, select any of the 14 GSP groups, and mark each as included (show only) or excluded (hide). Multiple zones can be mixed — e.g. include _F and _G, exclude _P — so the filter handles real operational scenarios like "show all Scottish units but not Northern England."

Filter state is local to the component and ephemeral (resets on page refresh). No backend, no store, no new API calls.

## Data Model

Zone data comes from `GSP_AREAS` already defined in `src/config/scenarios.ts`:

```ts
{ id: '_F', label: '_F — North Scotland' }
// ... 14 zones total
```

Zone membership uses the existing `gspGroup` field on `BMUnit` (e.g. `"_F"`). No new fields on the unit type, no new config files.

Filter state in `AvailableTable`:

```ts
const [gspFilter, setGspFilter] = useState<Record<string, 'include' | 'exclude'>>({})
```

Absence of a key = neutral (no effect on that zone). `setGspFilter({})` clears all.

## Filter Logic

Added as an extra step in the existing `visible` memo, after the type-filter and search checks:

```ts
const included = Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k)
const excluded = Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k)
if (included.length > 0 && !included.includes(r.gspGroup)) return false
if (excluded.includes(r.gspGroup)) return false
```

Both conditions apply simultaneously. A unit passes if:
- Its `gspGroup` is in at least one included zone (when any inclusions are set), AND
- Its `gspGroup` is not in any excluded zone

## UI Components

### Toolbar Button

Inserted in the existing `toolbar` div, after the scenario select. Three visual states:

| State | Appearance |
|-------|-----------|
| Inactive | `GSP ▾` — default border, muted text |
| Inclusions only | `GSP ▾ +2` — indigo border + indigo background, indigo badge |
| Exclusions only | `GSP ▾ −1` — red border + dark red background, red badge |
| Mixed | `GSP ▾ +2 −1` — indigo border, both badges |

### GspFilterPopover Subcomponent

Rendered as a `position: absolute` panel anchored below the toolbar button. Contains:

- **Header row**: "GSP Groups" label left, "Clear all" link right (calls `setGspFilter({})`)
- **Zone rows** (one per `GSP_AREAS` entry): zone label left, `[+ · −]` segmented toggle right
  - `+` = include (active state: green background/text)
  - `·` = neutral (active state: subtle highlight, default for all zones)
  - `−` = exclude (active state: red background/text)
  - Clicking a segment sets that zone's state immediately
- **Footer summary**: one line — "Showing: _F, _G · Hiding: _P" (only rendered when filter is active)

Close behaviour: click outside (via `document.mousedown` listener checking `!ref.current.contains(e.target)`) or press Escape.

### count-pill update

The "N of M" pill in the panel title already reflects the filtered `visible.length` — no changes needed there.

## Component Scope

All changes are confined to `src/components/AvailableTable.tsx`:

| Change | Details |
|--------|---------|
| New import | `GSP_AREAS` from `@/config/scenarios` |
| New state | `gspFilter`, `gspPopoverOpen` |
| New subcomponent | `GspFilterPopover` (inline, not a separate file) |
| Modified memo | `visible` — extra GSP filter step |
| Modified JSX | Toolbar: button + popover wrapper |

No changes to:
- `src/store/useModellingStore.ts`
- `src/app/page.tsx`
- `src/models/types.ts`
- Any other component

## Styling

Follows existing patterns in `globals.css`:
- Popover uses `var(--bg-panel)`, `var(--border)`, `var(--border-focus)` tokens
- Toggle active states use existing success/danger colour conventions
- Button badge uses `chip`-style inline spans

No new CSS classes required; inline styles acceptable for the popover since it is a single-use component.

## Out of Scope

- Persisting filter state to `localStorage`
- Real constraint zone data (future: replace `GSP_AREAS` mapping with actual transmission boundary → BMU data)
- Applying this filter to `SelectedTable` or `CommittedTab`
- Keyboard navigation within the popover
