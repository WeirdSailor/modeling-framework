# Pipeline — Deferred Improvements

Captured ideas that are too valuable to lose but not yet prioritised.

---

## Dynamic Parameter Coverage — LocalStorage Caching + 1-Year Lookback

**Priority:** High  
**Effort:** Medium  

### Problem

Dynamic parameters (NDZ, MZT, MNZT, SEL, SIL) are fetched using a rolling time-windowed approach because the Elexon API only returns change events (no snapshot/current-values endpoint exists). Units only appear in a window if they submitted a parameter change during that period.

Investigation (May 2026) showed:

| Lookback | Unique units with NDZ data |
|---|---|
| 12 weeks (current) | 126 |
| 26 weeks | 185 |
| 52 weeks | 269 |

New units trickle in steadily with no plateau within 1 year — meaning the current 12-week window misses roughly half the active fleet.

### Why Not Just Add More Windows

Each additional 7-day window fires 5 more concurrent API requests (one per endpoint: NDZ/MZT/MNZT/SEL/SIL). Going to 52 weeks = 260 concurrent dynamic param requests, which will hit Elexon rate limits. Simply raising the window count without batching/caching is not safe.

### Proposed Solution

1. **LocalStorage cache with 7-day TTL** — dynamic params change infrequently (units submit new entries only when values change). Cache the full result set keyed by bmUnit in localStorage. On load, use cached values if fresh; only re-fetch if stale or missing.

2. **52-week lookback on cache miss** — when fetching, go back 52 windows (1 year). Batch requests to avoid rate limiting: fetch 12 windows at a time per endpoint with a short delay between batches, or fire all 5 endpoints for one window before moving to the next.

3. **Progressive UI** — show a "Loading unit parameters…" status separately from the main data load, so the app is usable while older windows are still fetching.

### Expected Outcome

- First load: slower (~5–10s for dynamic params), but runs once per week
- Subsequent loads: instant (served from localStorage cache)
- Fleet coverage: ~269 units with NDZ data vs. 126 today (~113% improvement)
- Units genuinely inactive >1 year still show `—` — acceptable

### Implementation Notes

- Cache key: `bm-dyn-params-v1` in localStorage
- Cache entry shape: `{ fetchedAt: number, data: Record<string, { ndz?, mzt?, mnzt?, sel?, sil? }> }`
- Invalidate on: TTL expiry (7 days) or manual "Refresh parameters" button
- `fetchDynParam` in `src/services/elexon.ts` is the only function to change
- The 5-endpoint × N-window structure stays the same; only caching and window count change
