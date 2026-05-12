import type { BMUnit, SettlementPeriodData } from '@/models/types'
import { spToStartTime, dateToSp, dateToSettlementDate } from '@/utils/settlements'
import { computeAggregates } from '@/utils/margin'
import { FETCH_EXCLUDED_FUEL_TYPES } from '@/utils/fuelTypes'
import { loadStandingDataCache } from '@/services/standingDataSync'

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

interface RawBmUnitRef {
  nationalGridBmUnit: string
  elexonBmUnit: string | null
  fuelType: string
  generationCapacity: string
  demandCapacity: string
  gspGroupId: string
  gspGroupName: string
  bmUnitType: string
  interconnectorId: string | null
}

interface RawDynParam {
  bmUnit: string
  level?: number    // SEL / SIL
  notice?: number   // NDZ — seconds
  periodMin?: number // MNZT / MZT — minutes
  time?: string
  settlementDate?: string
  settlementPeriod?: number
}

interface RawPnEntry {
  bmUnit: string
  nationalGridBmUnit: string
  settlementDate: string
  settlementPeriod: number
  levelFrom: number
  levelTo: number
}

interface RawLimitEntry {
  bmUnit: string
  settlementDate: string
  settlementPeriod: number
  levelFrom: number
  levelTo: number
}

interface RawDemandEntry {
  settlementDate: string
  settlementPeriod: number
  quantity: number
}

// ---------------------------------------------------------------------------
// Helper: date range strings
// ---------------------------------------------------------------------------

function dayRange(settlementDate: string): { from: string; to: string } {
  return {
    from: `${settlementDate}T00:00:00Z`,
    to: `${settlementDate}T23:59:59Z`,
  }
}

// API enforces a max 7-day window. Fetch multiple windows in parallel to cover
// the last 84 days (~12 weeks) so we capture units with infrequently-updated standing data.
async function fetchDynParam(endpoint: string): Promise<RawDynParam[]> {
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const windows = Array.from({ length: 12 }, (_, i) => ({
    from: new Date(now - (i + 1) * sevenDays).toISOString(),
    to: new Date(now - i * sevenDays).toISOString(),
  }))
  const results = await Promise.all(
    windows.map(({ from, to }) =>
      safeFetch<{ data?: RawDynParam[] } | null>(
        `/api/elexon/${endpoint}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        null,
      ),
    ),
  )
  return results.flatMap((r) => r?.data ?? [])
}

// ---------------------------------------------------------------------------
// Helper: safe JSON fetch with fallback
// ---------------------------------------------------------------------------

async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[elexon] Non-OK response (${res.status}) for ${url}`)
      return fallback
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn(`[elexon] Fetch error for ${url}:`, err)
    return fallback
  }
}

// ---------------------------------------------------------------------------
// Helper: pick most-recent entry per BMU from a dynamic param array
// ---------------------------------------------------------------------------

function latestByBmu(entries: RawDynParam[]): Map<string, RawDynParam> {
  const map = new Map<string, RawDynParam>()
  for (const entry of entries) {
    const existing = map.get(entry.bmUnit)
    if (!existing) {
      map.set(entry.bmUnit, entry)
    } else {
      // Prefer the one with a later `time` string, or higher SP
      const existingTime = existing.time ?? ''
      const entryTime = entry.time ?? ''
      if (entryTime > existingTime) {
        map.set(entry.bmUnit, entry)
      } else if (entryTime === existingTime) {
        const existingSp = existing.settlementPeriod ?? 0
        const entrySp = entry.settlementPeriod ?? 0
        if (entrySp > existingSp) {
          map.set(entry.bmUnit, entry)
        }
      }
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Price tier helpers — fake placeholder until offer data is wired up
// ---------------------------------------------------------------------------

const OFFER_PRICE_TIERS = [105, 120, 135, 150, 157, 175, 185, 210]

// Returns fake highest-tier prices on the path to SEL and MEL output.
// priceToMel >= priceToSel; SEL price is undefined when hasSel is false.
function fakePriceTiers(hasSel: boolean): { priceToSel?: number; priceToMel: number } {
  const baseIdx = Math.floor(Math.random() * (OFFER_PRICE_TIERS.length - 2))
  const melIdx  = Math.min(OFFER_PRICE_TIERS.length - 1, baseIdx + Math.floor(Math.random() * 3))
  return {
    priceToSel: hasSel ? OFFER_PRICE_TIERS[baseIdx] : undefined,
    priceToMel: OFFER_PRICE_TIERS[melIdx],
  }
}

// ---------------------------------------------------------------------------
// Mock data generators
// ---------------------------------------------------------------------------

const MOCK_FUEL_TYPES = ['CCGT', 'NUCLEAR', 'COAL', 'HYDRO', 'OIL', 'BIOMASS', 'OCGT', 'PS']
const MOCK_GSP_GROUPS = ['_A', '_B', '_C', '_D', '_E', '_F', '_G', '_H', '_J', '_K', '_L', '_M', '_N', '_P']

function buildMockBmUnits(): BMUnit[] {
  const units: BMUnit[] = []
  const counts: Record<string, number> = {
    CCGT: 18, NUCLEAR: 8, COAL: 6, HYDRO: 5, OIL: 3, BIOMASS: 4, OCGT: 4, PS: 2,
  }
  const capacities: Record<string, number> = {
    CCGT: 400, NUCLEAR: 660, COAL: 500, HYDRO: 200, OIL: 150, BIOMASS: 100, OCGT: 50, PS: 300,
  }
  const selFraction = 0.3

  let idx = 0
  for (const [fuel, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) {
      idx++
      const cap = capacities[fuel] + (Math.random() * 100 - 50)
      const bmUnitId = `T_MOCK-${fuel.slice(0, 3)}-${String(i + 1).padStart(2, '0')}`
      units.push({
        bmUnitId,
        nationalGridBmUnit: `MOCK-${fuel.slice(0, 3)}-${String(i + 1).padStart(2, '0')}`,
        fuelType: fuel,
        registeredCapacity: Math.round(cap),
        gspGroup: MOCK_GSP_GROUPS[idx % MOCK_GSP_GROUPS.length],
        ndz: 30 + Math.round(Math.random() * 90),        // 30–120 min
        mnzt: 180 + Math.round(Math.random() * 300),     // 180–480 min
        mzt: 30 + Math.round(Math.random() * 90),
        sel: Math.round(cap * selFraction),
        sil: 0,
        ...fakePriceTiers(true),
      })
    }
  }
  return units
}

function buildMockDemand(): Map<number, number> {
  const map = new Map<number, number>()
  for (let sp = 1; sp <= 48; sp++) {
    // Sinusoidal: SP 1 = midnight, SP 25 = noon
    // Demand peaks around SP 25 (noon) at ~38,000 MW, troughs around SP 5 (02:00) at ~28,000 MW
    const hourFraction = (sp - 1) / 48  // 0 to <1
    const angle = 2 * Math.PI * (hourFraction - 0.25) // shift so peak at hourFraction=0.5
    const demand = 33000 + 5000 * Math.sin(angle) + (Math.random() * 400 - 200)
    map.set(sp, Math.round(demand))
  }
  return map
}

function buildMockPN(units: BMUnit[]): Map<number, Map<string, number>> {
  const outerMap = new Map<number, Map<string, number>>()

  // Deterministically decide which units are "committed" (~70%)
  const committed = new Set<string>()
  for (const unit of units) {
    if (Math.random() < 0.70) committed.add(unit.bmUnitId)
  }

  for (let sp = 1; sp <= 48; sp++) {
    const spMap = new Map<string, number>()
    for (const unit of units) {
      if (committed.has(unit.bmUnitId)) {
        // PN = 60–80% of MEL (registered capacity)
        const fraction = 0.60 + Math.random() * 0.20
        spMap.set(unit.bmUnitId, Math.round(unit.registeredCapacity * fraction))
      } else {
        spMap.set(unit.bmUnitId, 0)
      }
    }
    outerMap.set(sp, spMap)
  }
  return outerMap
}

function buildMockMELS(units: BMUnit[]): Map<number, Map<string, number>> {
  const outerMap = new Map<number, Map<string, number>>()
  for (let sp = 1; sp <= 48; sp++) {
    const spMap = new Map<string, number>()
    for (const unit of units) {
      spMap.set(unit.bmUnitId, unit.registeredCapacity)
    }
    outerMap.set(sp, spMap)
  }
  return outerMap
}

function buildMockMILS(units: BMUnit[]): Map<number, Map<string, number>> {
  const outerMap = new Map<number, Map<string, number>>()
  for (let sp = 1; sp <= 48; sp++) {
    const spMap = new Map<string, number>()
    for (const unit of units) {
      spMap.set(unit.bmUnitId, 0)
    }
    outerMap.set(sp, spMap)
  }
  return outerMap
}

// ---------------------------------------------------------------------------
// Module-level mock constants — computed once at import time to keep mock
// data stable across re-fetches (avoids non-deterministic Math.random() calls)
// ---------------------------------------------------------------------------

const MOCK_BM_UNITS = buildMockBmUnits()
const MOCK_DEMAND = buildMockDemand()
const MOCK_PN = buildMockPN(MOCK_BM_UNITS)

// ---------------------------------------------------------------------------
// Public API: fetchBmUnits
// ---------------------------------------------------------------------------

export async function fetchBmUnits(): Promise<BMUnit[]> {
  // Parallel fetches — dynamic params fan out across 5 × 7-day windows each
  const [refRaw, selEntries, silEntries, ndzEntries, mnztEntries, mztEntries, firestoreCache] = await Promise.all([
    safeFetch<RawBmUnitRef[] | null>('/api/elexon/reference/bmunits/all', null),
    fetchDynParam('datasets/SEL'),
    fetchDynParam('datasets/SIL'),
    fetchDynParam('datasets/NDZ'),
    fetchDynParam('datasets/MNZT'),
    fetchDynParam('datasets/MZT'),
    loadStandingDataCache().catch(() => new Map()),
  ])

  // If reference data failed entirely, fall back to mock
  if (!refRaw || !Array.isArray(refRaw) || refRaw.length === 0) {
    console.warn('[elexon] BM unit reference data unavailable — using mock data')
    return MOCK_BM_UNITS
  }

  // Build lookup maps for dynamic params (latest entry wins)
  const selMap = latestByBmu(selEntries)
  const silMap = latestByBmu(silEntries)
  const ndzMap = latestByBmu(ndzEntries)
  const mnztMap = latestByBmu(mnztEntries)
  const mztMap = latestByBmu(mztEntries)

  const units: BMUnit[] = []

  for (const raw of refRaw) {
    // Only transmission-connected units (T_ prefix)
    if (raw.bmUnitType !== 'T') continue

    // Exclude interconnectors and solar; keep WIND so Pullback scenario can use it
    if (FETCH_EXCLUDED_FUEL_TYPES.has(raw.fuelType)) continue

    // Only units with positive generation capacity
    const cap = parseFloat(raw.generationCapacity)
    if (!isFinite(cap) || cap <= 0) continue

    // Prefer elexonBmUnit as the key; fall back to nationalGridBmUnit
    const bmUnitId = raw.elexonBmUnit ?? raw.nationalGridBmUnit
    if (!bmUnitId) continue

    const selEntry = selMap.get(bmUnitId) ?? selMap.get(raw.nationalGridBmUnit)
    const silEntry = silMap.get(bmUnitId) ?? silMap.get(raw.nationalGridBmUnit)
    const ndzEntry = ndzMap.get(bmUnitId) ?? ndzMap.get(raw.nationalGridBmUnit)
    const mnztEntry = mnztMap.get(bmUnitId) ?? mnztMap.get(raw.nationalGridBmUnit)
    const mztEntry = mztMap.get(bmUnitId) ?? mztMap.get(raw.nationalGridBmUnit)

    const cached = firestoreCache.get(bmUnitId) ?? firestoreCache.get(raw.nationalGridBmUnit)

    units.push({
      bmUnitId,
      nationalGridBmUnit: raw.nationalGridBmUnit,
      fuelType: raw.fuelType,
      registeredCapacity: Math.round(cap),
      gspGroup: raw.gspGroupId,
      // Live fetch wins; Firestore fills gaps for units inactive in the last 84 days
      sel:  selEntry?.level      !== undefined ? selEntry.level      : cached?.sel,
      sil:  silEntry?.level      !== undefined ? silEntry.level      : undefined,
      ndz:  ndzEntry?.notice     !== undefined ? ndzEntry.notice     : cached?.ndz,
      mnzt: mnztEntry?.periodMin !== undefined ? mnztEntry.periodMin : cached?.mnzt,
      mzt:  mztEntry?.periodMin  !== undefined ? mztEntry.periodMin  : cached?.mzt,
      ...fakePriceTiers(selEntry?.level !== undefined || cached?.sel !== undefined),
    })
  }

  if (units.length === 0) {
    console.warn('[elexon] No qualifying BM units after filtering — using mock data')
    return MOCK_BM_UNITS
  }

  return units
}

// ---------------------------------------------------------------------------
// Public API: fetchDemandForecast
// ---------------------------------------------------------------------------

export async function fetchDemandForecast(settlementDate: string): Promise<Map<number, number>> {
  const { from, to } = dayRange(settlementDate)
  const url = `/api/elexon/forecast/demand/total/day-ahead?from=${from}&to=${to}`

  const raw = await safeFetch<{ data?: RawDemandEntry[] } | null>(url, null)

  if (!raw?.data || raw.data.length === 0) {
    console.warn('[elexon] Demand forecast unavailable — using mock data')
    return MOCK_DEMAND
  }

  const map = new Map<number, number>()
  for (const entry of raw.data) {
    if (entry.settlementDate === settlementDate) {
      map.set(entry.settlementPeriod, entry.quantity)
    }
  }

  if (map.size === 0) {
    console.warn('[elexon] Demand forecast had no entries for date — using mock data')
    return MOCK_DEMAND
  }

  return map
}

// ---------------------------------------------------------------------------
// Public API: fetchPN
// ---------------------------------------------------------------------------

export async function fetchPN(
  settlementDate: string
): Promise<Map<number, Map<string, number>>> {
  // Note: safeFetch is not used here because each SP is fetched independently
  // with per-request .catch() to allow partial success (some SPs may be missing)
  const results = await Promise.all(
    Array.from({ length: 48 }, (_, i) => {
      const sp = i + 1
      return fetch(`/api/elexon/datasets/PN?settlementDate=${settlementDate}&settlementPeriod=${sp}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((d: { data?: RawPnEntry[] }) => ({ sp, data: d.data ?? [] }))
        .catch((err) => {
          console.warn(`[elexon] PN fetch failed for SP ${sp}:`, err)
          return { sp, data: [] as RawPnEntry[] }
        })
    })
  )

  const outerMap = new Map<number, Map<string, number>>()
  let totalEntries = 0

  for (const { sp, data } of results) {
    const spMap = new Map<string, number>()
    for (const entry of data) {
      const avg = (entry.levelFrom + entry.levelTo) / 2
      spMap.set(entry.bmUnit, avg)
    }
    outerMap.set(sp, spMap)
    totalEntries += data.length
  }

  if (totalEntries === 0) {
    console.warn('[elexon] PN data entirely empty — mock PN will be applied in fetchAllData')
  }

  return outerMap
}

// ---------------------------------------------------------------------------
// Public API: fetchMELS
// ---------------------------------------------------------------------------

export async function fetchMELS(
  settlementDate: string
): Promise<Map<number, Map<string, number>>> {
  const { from, to } = dayRange(settlementDate)
  const url = `/api/elexon/datasets/MELS?from=${from}&to=${to}`

  const raw = await safeFetch<{ data?: RawLimitEntry[] } | null>(url, null)

  if (!raw?.data || raw.data.length === 0) {
    console.warn('[elexon] MELS data unavailable — will use registeredCapacity as fallback in fetchAllData')
    return new Map()
  }

  const outerMap = new Map<number, Map<string, number>>()
  for (const entry of raw.data) {
    if (entry.settlementDate !== settlementDate) continue
    let spMap = outerMap.get(entry.settlementPeriod)
    if (!spMap) {
      spMap = new Map()
      outerMap.set(entry.settlementPeriod, spMap)
    }
    const avg = (entry.levelFrom + entry.levelTo) / 2
    spMap.set(entry.bmUnit, avg)
  }

  return outerMap
}

// ---------------------------------------------------------------------------
// Public API: fetchMILS
// ---------------------------------------------------------------------------

export async function fetchMILS(
  settlementDate: string
): Promise<Map<number, Map<string, number>>> {
  const { from, to } = dayRange(settlementDate)
  const url = `/api/elexon/datasets/MILS?from=${from}&to=${to}`

  const raw = await safeFetch<{ data?: RawLimitEntry[] } | null>(url, null)

  if (!raw?.data || raw.data.length === 0) {
    console.warn('[elexon] MILS data unavailable — defaulting to zero MIL')
    return new Map()
  }

  const outerMap = new Map<number, Map<string, number>>()
  for (const entry of raw.data) {
    if (entry.settlementDate !== settlementDate) continue
    let spMap = outerMap.get(entry.settlementPeriod)
    if (!spMap) {
      spMap = new Map()
      outerMap.set(entry.settlementPeriod, spMap)
    }
    const avg = (entry.levelFrom + entry.levelTo) / 2
    spMap.set(entry.bmUnit, avg)
  }

  return outerMap
}

// ---------------------------------------------------------------------------
// Internal helper: fetch PN for a single {date, sp} pair
// ---------------------------------------------------------------------------

async function fetchSinglePN(settlementDate: string, sp: number): Promise<Map<string, number>> {
  return fetch(
    `/api/elexon/datasets/PN?settlementDate=${settlementDate}&settlementPeriod=${sp}`
  )
    .then(r => (r.ok ? r.json() : { data: [] }))
    .then((d: { data?: RawPnEntry[] }) => {
      const map = new Map<string, number>()
      for (const entry of (d.data ?? [])) {
        map.set(entry.bmUnit, (entry.levelFrom + entry.levelTo) / 2)
      }
      return map
    })
    .catch(() => new Map<string, number>())
}

// ---------------------------------------------------------------------------
// Public API: fetchAllData — rolling 24-hour window from now
// ---------------------------------------------------------------------------

export async function fetchAllData(): Promise<{
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
}> {
  const now = new Date()
  const currentSp = dateToSp(now)
  const todayDate = dateToSettlementDate(now)
  const tomorrowDate = dateToSettlementDate(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  const yesterdayDate = dateToSettlementDate(new Date(now.getTime() - 24 * 60 * 60 * 1000))

  // 48 slots starting from the current SP of today, wrapping into tomorrow.
  // slot.slot is the 1-based index used as settlementPeriod in the store.
  const slotPlan: Array<{ slot: number; date: string; sp: number }> = []
  for (let sp = currentSp; sp <= 48; sp++) {
    slotPlan.push({ slot: slotPlan.length + 1, date: todayDate, sp })
  }
  for (let sp = 1; sp < currentSp; sp++) {
    slotPlan.push({ slot: slotPlan.length + 1, date: tomorrowDate, sp })
  }

  // Fetch base data, yesterday's PN, and per-slot PN in parallel
  const [
    [units, todayDemand, tomorrowDemand, todayMels, tomorrowMels, todayMils, tomorrowMils, yesterdayPN],
    pnResults,
  ] = await Promise.all([
    Promise.all([
      fetchBmUnits(),
      fetchDemandForecast(todayDate),
      fetchDemandForecast(tomorrowDate),
      fetchMELS(todayDate),
      fetchMELS(tomorrowDate),
      fetchMILS(todayDate),
      fetchMILS(tomorrowDate),
      fetchPN(yesterdayDate),
    ]),
    Promise.all(slotPlan.map(({ date, sp }) => fetchSinglePN(date, sp))),
  ])

  const isYesterdayPnUsable = [...yesterdayPN.values()].some(m => m.size > 0)

  // If every slot came back empty fall back to mock PN (pure offline mode).
  // When only tomorrow's slots are empty that is correct — no D+1 PNs yet.
  const isPnGloballyEmpty = pnResults.every(m => m.size === 0)
  const mockPn = isPnGloballyEmpty ? buildMockPN(units) : null
  if (mockPn) console.warn('[elexon] All PN slots empty — using mock PN data')

  const isMelsEmpty = todayMels.size === 0 && tomorrowMels.size === 0
  const mockMels = isMelsEmpty ? buildMockMELS(units) : null

  const isMilsEmpty = todayMils.size === 0 && tomorrowMils.size === 0
  const mockMils = isMilsEmpty ? buildMockMILS(units) : null

  const settlementPeriods: SettlementPeriodData[] = []

  for (let i = 0; i < slotPlan.length; i++) {
    const { slot, date, sp: actualSp } = slotPlan[i]

    const demandMap = date === todayDate ? todayDemand : tomorrowDemand
    const demand = demandMap.get(actualSp) ?? 33000

    // PN — confirmed data first, D-1 proxy for unconfirmed slots, mock in offline mode
    const rawPn = mockPn
      ? (mockPn.get(actualSp) ?? new Map<string, number>())
      : pnResults[i].size > 0
        ? pnResults[i]
        : isYesterdayPnUsable
          ? (yesterdayPN.get(actualSp) ?? new Map<string, number>())
          : new Map<string, number>()
    const pn: Record<string, number> = {}
    for (const [bmUnit, value] of rawPn) pn[bmUnit] = value

    // MEL — real MELS is always empty from the API; fallback = registeredCapacity
    const melsMap = date === todayDate ? todayMels : tomorrowMels
    const rawMel = mockMels ? mockMels.get(actualSp) : melsMap.get(actualSp)
    const mel: Record<string, number> = {}
    if (rawMel) {
      for (const [bmUnit, value] of rawMel) mel[bmUnit] = value
    } else {
      for (const unit of units) mel[unit.bmUnitId] = unit.registeredCapacity
    }

    // MIL — default to 0 when absent
    const milsMap = date === todayDate ? todayMils : tomorrowMils
    const rawMil = mockMils ? mockMils.get(actualSp) : milsMap.get(actualSp)
    const mil: Record<string, number> = {}
    if (rawMil) {
      for (const [bmUnit, value] of rawMil) mil[bmUnit] = value
    }

    // Gate-closure status: mock mode treats all slots as confirmed
    const hasConfirmedPn = isPnGloballyEmpty || pnResults[i].size > 0

    // D-1 proxy: estimate EMX/EOL from yesterday's same-SP PN for unconfirmed slots
    let proxyEmx = 0
    let proxyEol = 0
    if (!hasConfirmedPn && isYesterdayPnUsable) {
      const d1Pn = yesterdayPN.get(actualSp) ?? new Map<string, number>()
      for (const [bmUnit, pn] of d1Pn) {
        if (pn > 1) {
          proxyEmx += mel[bmUnit] ?? 0
          proxyEol += pn
        }
      }
    }

    const partial: SettlementPeriodData = {
      settlementDate: date,
      settlementPeriod: slot,
      startTime: spToStartTime(actualSp, date),
      pn,
      mel,
      mil,
      demand,
      emx: 0,
      eol: 0,
      emi: 0,
      margin: 0,
      hasConfirmedPn,
      proxyEmx,
      proxyEol,
    }

    settlementPeriods.push({ ...partial, ...computeAggregates(partial, [], units) })
  }

  return { units, settlementPeriods }
}

// ---------------------------------------------------------------------------
// Public API: fetchHistoricalData — fixed 48-SP window anchored to a past date
// ---------------------------------------------------------------------------

export async function fetchHistoricalData(
  startDate: string,  // YYYY-MM-DD
  startSp: number,    // 1–48; first SP slot of the 24-hour window
): Promise<{
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
}> {
  const nextDate = dateToSettlementDate(
    new Date(new Date(`${startDate}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000)
  )

  // 48 slots: startSp..48 on startDate, then 1..(startSp-1) on nextDate
  const slotPlan: Array<{ slot: number; date: string; sp: number }> = []
  for (let sp = startSp; sp <= 48; sp++) {
    slotPlan.push({ slot: slotPlan.length + 1, date: startDate, sp })
  }
  for (let sp = 1; sp < startSp; sp++) {
    slotPlan.push({ slot: slotPlan.length + 1, date: nextDate, sp })
  }

  const [
    [units, startDemand, nextDemand, startMels, nextMels, startMils, nextMils],
    pnResults,
  ] = await Promise.all([
    Promise.all([
      fetchBmUnits(),
      fetchDemandForecast(startDate),
      fetchDemandForecast(nextDate),
      fetchMELS(startDate),
      fetchMELS(nextDate),
      fetchMILS(startDate),
      fetchMILS(nextDate),
    ]),
    Promise.all(slotPlan.map(({ date, sp }) => fetchSinglePN(date, sp))),
  ])

  const isPnGloballyEmpty = pnResults.every(m => m.size === 0)
  const mockPn = isPnGloballyEmpty ? buildMockPN(units) : null
  if (mockPn) console.warn('[elexon] Historical PN entirely empty — using mock PN data')

  const isMelsEmpty = startMels.size === 0 && nextMels.size === 0
  const mockMels = isMelsEmpty ? buildMockMELS(units) : null

  const isMilsEmpty = startMils.size === 0 && nextMils.size === 0
  const mockMils = isMilsEmpty ? buildMockMILS(units) : null

  const settlementPeriods: SettlementPeriodData[] = []

  for (let i = 0; i < slotPlan.length; i++) {
    const { slot, date, sp: actualSp } = slotPlan[i]

    const demandMap = date === startDate ? startDemand : nextDemand
    const demand = demandMap.get(actualSp) ?? 33000

    const rawPn = mockPn
      ? (mockPn.get(actualSp) ?? new Map<string, number>())
      : pnResults[i]
    const pn: Record<string, number> = {}
    for (const [bmUnit, value] of rawPn) pn[bmUnit] = value

    const melsMap = date === startDate ? startMels : nextMels
    const rawMel = mockMels ? mockMels.get(actualSp) : melsMap.get(actualSp)
    const mel: Record<string, number> = {}
    if (rawMel) {
      for (const [bmUnit, value] of rawMel) mel[bmUnit] = value
    } else {
      for (const unit of units) mel[unit.bmUnitId] = unit.registeredCapacity
    }

    const milsMap = date === startDate ? startMils : nextMils
    const rawMil = mockMils ? mockMils.get(actualSp) : milsMap.get(actualSp)
    const mil: Record<string, number> = {}
    if (rawMil) {
      for (const [bmUnit, value] of rawMil) mil[bmUnit] = value
    }

    const partial: SettlementPeriodData = {
      settlementDate: date,
      settlementPeriod: slot,
      startTime: spToStartTime(actualSp, date),
      pn,
      mel,
      mil,
      demand,
      emx: 0,
      eol: 0,
      emi: 0,
      margin: 0,
      hasConfirmedPn: true,
      proxyEmx: 0,
      proxyEol: 0,
    }

    settlementPeriods.push({ ...partial, ...computeAggregates(partial, [], units) })
  }

  return { units, settlementPeriods }
}
