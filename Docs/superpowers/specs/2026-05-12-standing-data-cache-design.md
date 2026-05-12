# Standing Data Cache — Design Spec

**Date:** 2026-05-12
**Status:** Approved

## Problem

Elexon's standing data endpoints (NDZ, MZT, MNZT, SEL) are change-only: units only submit new entries when a value changes. The current app fetches 84 days of history, which misses units that last submitted more than 3 months ago. Those units show `—` in the Available table even though valid data exists further back in Elexon's history.

MEL is unaffected — it always comes from `registeredCapacity` in the BM unit reference API.

## Solution

Persist the last known NDZ/MZT/MNZT/SEL value for every unit in Firebase Firestore. A one-time backfill fetches years of Elexon history. Subsequent incremental syncs stay current. The Available table reads from this cache to fill any gaps the live 84-day fetch misses.

---

## Firebase Project

- **Project:** `so-scheduling`
- **Service account:** `firebase-adminsdk-fbsvc@so-scheduling.iam.gserviceaccount.com`
- **Service account key:** `serviceAccountKey.json` (gitignored — never commit)

---

## Firestore Data Model

### Collection: `standing_data`

One document per BM unit, keyed by `bmUnitId` (e.g. `T_CNQPS-2`):

```
{
  ndz:   number | null,   // minutes; null = not found in any historical data
  mzt:   number | null,   // minutes
  mnzt:  number | null,   // minutes
  sel:   number | null,   // MW
  ndzAt: string,          // ISO date the value was effective from, e.g. "2024-03-15"
  mztAt: string,
  mnztAt: string,
  selAt:  string,
}
```

### Collection: `sync_metadata`

Single document at `sync_metadata/config`:

```
{
  backfillComplete: boolean,   // true once the one-time backfill has finished
  backfillFrom:     string,    // e.g. "2020-01-01" — how far back the backfill went
  lastSyncedTo:     string,    // e.g. "2026-05-12" — last date included in any sync
}
```

### Merge rule

When writing new data, a stored value is only overwritten if the incoming Elexon entry's effective date is **more recent** than the stored `*At` field. This makes all writes idempotent — backfill, incremental sync, and the live fetch can all write safely without stomping on newer data.

---

## Fetch & Sync Strategy

### One-time backfill

Triggered manually from the Standing Data tab. Runs entirely in the browser.

1. Fetch the current unit list from the BM unit reference API to know the full set of expected `bmUnitId`s.
2. Go back in **yearly chunks** from today. For each year:
   - Fan out 52 × 7-day windows for all 4 params (NDZ, MZT, MNZT, SEL) in parallel, sent in batches of 20 to avoid rate limiting — 208 requests per year.
   - Apply the merge rule: write to Firestore only where the incoming date beats the stored `*At`.
3. After each year, check coverage: does every known unit have a non-null value for all 4 params? If yes, stop early.
4. Maximum lookback: 6 years (~2020). Units with no data after 6 years are genuinely absent from Elexon's history (mothballed/decommissioned).
5. On completion, write `backfillComplete: true` and `backfillFrom: <earliest date reached>` to `sync_metadata/config`.

### Incremental sync

Triggered manually ("Sync Recent" button) or automatically on app load once `backfillComplete` is true.

Fetches from `lastSyncedTo` to today — typically 1–2 weekly windows. Fast. Updates `lastSyncedTo` on completion.

---

## App Integration

`fetchBmUnits()` in `elexon.ts` runs two fetches in parallel:

1. **Live 84-day fetch** — existing `fetchDynParam` calls for NDZ/MZT/MNZT/SEL (unchanged)
2. **Firestore load** — reads all documents from `standing_data` collection

After both resolve, they are merged per unit:
- Live fetch value wins if it returned a defined (non-`undefined`) value — it is always the most recent within 84 days
- Firestore value fills in where the live fetch returned `undefined` (unit not active in the last 84 days)

No visible delay — the Firestore read runs concurrently with the existing API calls.

---

## Standing Data Tab (ConfigPanel — 4th tab)

A new **"Standing Data"** tab in `ConfigPanel`, alongside Tweaks, Scenarios, and Data.

### Status banner

| State | Content |
|-------|---------|
| Cache empty | "Standing data cache is empty. Run backfill to populate." + **Run Backfill** button |
| Backfill running | Progress bar + "Searching 2024... 142/210 units covered" + **Cancel** button |
| Backfill complete | "Backfill complete (back to Jan 2020). Last synced: 12 May 2026." + **Sync Recent** button |

### Summary row

Four counters showing cache coverage:

```
NDZ: 198/210 units   MZT: 201/210   MNZT: 200/210   SEL: 195/210
```

Units not covered after backfill are genuinely absent from Elexon history — the counters make this transparent rather than silently showing `—`.

No unit data table in this tab (can be added later if needed).

---

## Firebase Web SDK Setup

### Dependencies

```
firebase          — web SDK (client-side, added to package.json)
firebase-admin    — admin SDK (devDependency, scripts only)
```

### Environment variables (`.env.local`)

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDhTMY_wXd_T__U9tvAKqfkonNsRrCoUtU
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=so-scheduling.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=so-scheduling
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=so-scheduling.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=285205300257
NEXT_PUBLIC_FIREBASE_APP_ID=1:285205300257:web:f23f4e38ee2a578453cf60
```

### `src/lib/firebase.ts`

Initialises the Firebase app once and exports `db` (Firestore instance). Used by `elexon.ts` and the Standing Data tab component.

### Firestore security rules

Test mode (allow all reads/writes) is acceptable for this prototype. Tighten before any production deployment.

---

## Files Affected

| File | Change |
|------|--------|
| `src/lib/firebase.ts` | New — Firebase app + Firestore initialisation |
| `src/services/elexon.ts` | `fetchBmUnits` loads Firestore cache in parallel and merges |
| `src/components/ConfigPanel.tsx` | Add Standing Data tab with status banner + summary row |
| `src/services/standingDataSync.ts` | New — backfill and incremental sync logic |
| `.env.local` | New — Firebase web SDK config vars |
| `scripts/setup-firestore.js` | Already created — one-time Firestore collection setup |
| `serviceAccountKey.json` | Gitignored — admin SDK key for scripts only |

---

## Out of Scope

- Drafts, unit services, data overrides — remain in Zustand (session only)
- Real-time Firestore listeners — load-on-action is sufficient for this prototype
- Unit data table in the Standing Data tab — deferred
