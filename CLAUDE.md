@AGENTS.md

# Modelling Framework — Claude Context

## Project Summary

A client-side Next.js 16 decision-support tool for GB electricity system operators. Fetches live data from the public Elexon Insights API and allows operators to model (commit) generation units to close margin deficits across 48 settlement periods.

For a full description of what was built, what data is fetched, and how the app works, read **[Docs/overview.md](./Docs/overview.md)**.

## Key Architecture Decisions

- **All state in Zustand** (`src/store/useModellingStore.ts`). No server state, no React Query.
- **Margin recalculation is synchronous and in-browser** — `computeAggregates` in `src/utils/margin.ts` runs inside each `set()` call in the store whenever modelling actions change.
- **A unit is "committed"** if its PN > 1 MW for any SP OR if a `ModellingAction` covers it. This is the single source of truth — see `isUnitCommitted` in `src/utils/margin.ts`.
- **PN requires 48 parallel API calls** — one per settlement period. This is a hard constraint of the Elexon `/datasets/PN` endpoint.
- **MELS / MILS** (not MEL / MIL) are the correct Elexon dataset codes.
- **NDZ is returned in seconds** by the API and converted to minutes on ingest.
- **Mock data is stable** — computed once at module load in `src/services/elexon.ts` via module-level constants.

## Running the App

```bash
npm run dev   # http://localhost:3000
npm run build # production build check
npx tsc --noEmit # type check
```

## What Not to Change Without Reading First

- `src/utils/fuelTypes.ts` — shared exclusion list used by both `elexon.ts` and `UnitGrid.tsx`. Keep in sync.
- The `refreshAggregates` helper in the store — called inside every `addModellingAction` and `clearAllModelling`. If you add new ways to change settlement data, call it there too.
- `setSettlementPeriods` in the store — already applies `refreshAggregates` so existing modelling actions are not lost on re-fetch.
