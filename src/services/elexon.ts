import type { BMUnit, SettlementPeriodData } from '@/models/types'
import { spToStartTime } from '@/utils/settlements'
import { computeAggregates } from '@/utils/margin'
import { EXCLUDED_FUEL_TYPES } from '@/utils/fuelTypes'

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

function dynamicParamRange(): { from: string; to: string } {
  const now = new Date()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const from = new Date(now.getTime() - sevenDays).toISOString()
  const to = new Date(now.getTime() + sevenDays).toISOString()
  return { from, to }
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
// Mock data generators
// ---------------------------------------------------------------------------

const MOCK_FUEL_TYPES = ['CCGT', 'NUCLEAR', 'COAL', 'HYDRO', 'OIL', 'BIOMASS', 'OCGT', 'PS']
const MOCK_GSP_GROUPS = ['_A', '_B', '_C', '_D', '_E', '_F', '_G', '_H', '_J', '_K']

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
  const { from, to } = dynamicParamRange()

  // Parallel fetches
  const [refRaw, selRaw, silRaw, ndzRaw, mnztRaw, mztRaw] = await Promise.all([
    safeFetch<RawBmUnitRef[] | null>('/api/elexon/reference/bmunits/all', null),
    safeFetch<{ data?: RawDynParam[] } | null>(`/api/elexon/datasets/SEL?from=${from}&to=${to}`, null),
    safeFetch<{ data?: RawDynParam[] } | null>(`/api/elexon/datasets/SIL?from=${from}&to=${to}`, null),
    safeFetch<{ data?: RawDynParam[] } | null>(`/api/elexon/datasets/NDZ?from=${from}&to=${to}`, null),
    safeFetch<{ data?: RawDynParam[] } | null>(`/api/elexon/datasets/MNZT?from=${from}&to=${to}`, null),
    safeFetch<{ data?: RawDynParam[] } | null>(`/api/elexon/datasets/MZT?from=${from}&to=${to}`, null),
  ])

  // If reference data failed entirely, fall back to mock
  if (!refRaw || !Array.isArray(refRaw) || refRaw.length === 0) {
    console.warn('[elexon] BM unit reference data unavailable — using mock data')
    return MOCK_BM_UNITS
  }

  // Build lookup maps for dynamic params (latest entry wins)
  const selMap = latestByBmu(selRaw?.data ?? [])
  const silMap = latestByBmu(silRaw?.data ?? [])
  const ndzMap = latestByBmu(ndzRaw?.data ?? [])
  const mnztMap = latestByBmu(mnztRaw?.data ?? [])
  const mztMap = latestByBmu(mztRaw?.data ?? [])

  const units: BMUnit[] = []

  for (const raw of refRaw) {
    // Exclude non-dispatchable / interconnectors
    if (EXCLUDED_FUEL_TYPES.has(raw.fuelType)) continue

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

    units.push({
      bmUnitId,
      nationalGridBmUnit: raw.nationalGridBmUnit,
      fuelType: raw.fuelType,
      registeredCapacity: Math.round(cap),
      gspGroup: raw.gspGroupId,
      sel: selEntry?.level !== undefined ? selEntry.level : undefined,
      sil: silEntry?.level !== undefined ? silEntry.level : undefined,
      // NDZ: API returns seconds — convert to minutes
      ndz: ndzEntry?.notice !== undefined ? Math.round(ndzEntry.notice / 60) : undefined,
      mnzt: mnztEntry?.periodMin !== undefined ? mnztEntry.periodMin : undefined,
      mzt: mztEntry?.periodMin !== undefined ? mztEntry.periodMin : undefined,
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
// Public API: fetchAllData
// ---------------------------------------------------------------------------

export async function fetchAllData(settlementDate: string): Promise<{
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
}> {
  // Fetch everything in parallel
  const [units, demandMap, pnMap, melsMap, milsMap] = await Promise.all([
    fetchBmUnits(),
    fetchDemandForecast(settlementDate),
    fetchPN(settlementDate),
    fetchMELS(settlementDate),
    fetchMILS(settlementDate),
  ])

  const nonEmptySps = Array.from(pnMap.values()).filter(m => m.size > 0).length
  if (nonEmptySps > 0 && nonEmptySps < 48) {
    console.warn(`[elexon] PN data partial: only ${nonEmptySps}/48 SPs returned data — remaining periods will show zero EOL`)
  }

  // If PN came back completely empty, use the stable module-level mock PN
  const isPnEmpty = Array.from(pnMap.values()).every((m) => m.size === 0)
  const mockPn = isPnEmpty ? MOCK_PN : null

  // If MELS came back completely empty, build mock MELS (= registeredCapacity)
  const isMelsEmpty = melsMap.size === 0
  const mockMels = isMelsEmpty ? buildMockMELS(units) : null

  // If MILS came back completely empty, build mock MILS (= 0)
  const isMilsEmpty = milsMap.size === 0
  const mockMils = isMilsEmpty ? buildMockMILS(units) : null

  const settlementPeriods: SettlementPeriodData[] = []

  for (let sp = 1; sp <= 48; sp++) {
    const demand = demandMap.get(sp) ?? 33000

    // Build pn record
    const rawPnForSp = mockPn ? mockPn.get(sp) : pnMap.get(sp)
    const pn: Record<string, number> = {}
    if (rawPnForSp) {
      for (const [bmUnit, value] of rawPnForSp) {
        pn[bmUnit] = value
      }
    }

    // Build mel record — fall back to registeredCapacity if MELS absent
    const rawMelForSp = mockMels ? mockMels.get(sp) : melsMap.get(sp)
    const mel: Record<string, number> = {}
    if (rawMelForSp) {
      for (const [bmUnit, value] of rawMelForSp) {
        mel[bmUnit] = value
      }
    } else {
      // Fallback: use registeredCapacity for every unit
      for (const unit of units) {
        mel[unit.bmUnitId] = unit.registeredCapacity
      }
    }

    // Build mil record — default to 0 if MILS absent
    const rawMilForSp = mockMils ? mockMils.get(sp) : milsMap.get(sp)
    const mil: Record<string, number> = {}
    if (rawMilForSp) {
      for (const [bmUnit, value] of rawMilForSp) {
        mil[bmUnit] = value
      }
    }

    const partial: SettlementPeriodData = {
      settlementPeriod: sp,
      startTime: spToStartTime(sp, settlementDate),
      pn,
      mel,
      mil,
      demand,
      emx: 0,
      eol: 0,
      emi: 0,
      margin: 0,
    }

    const aggregates = computeAggregates(partial, [], units)
    settlementPeriods.push({
      ...partial,
      ...aggregates,
    })
  }

  return { units, settlementPeriods }
}
