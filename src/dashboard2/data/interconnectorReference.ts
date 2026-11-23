export interface InterconnectorReference {
  bmUnitId: string
  interconnectorId: string
}

interface RawReference {
  elexonBmUnit?: string | null
  nationalGridBmUnit?: string
  interconnectorId?: string | null
}

const NAMES: Record<string, string> = {
  BRITNED: 'BritNed', ELECLINK: 'ElecLink', EWIC: 'East–West', FRANCE: 'IFA',
  GREENLINK: 'Greenlink', IFA2: 'IFA2', MOYLE: 'Moyle', NEMOLINK: 'Nemo Link',
  NSL: 'North Sea Link', VIKINGLINK: 'Viking Link',
}

export function interconnectorName(id: string): string {
  return NAMES[id] ?? id
}

export function parseInterconnectorReference(raw: RawReference[]): InterconnectorReference[] {
  return raw.flatMap(unit => {
    const bmUnitId = unit.elexonBmUnit ?? unit.nationalGridBmUnit
    return bmUnitId?.startsWith('I_') && unit.interconnectorId
      ? [{ bmUnitId, interconnectorId: unit.interconnectorId }]
      : []
  })
}

let cached: Promise<InterconnectorReference[]> | undefined

/** Keep the full, unfiltered reference separate from the generation-unit picker. */
export function loadInterconnectorReference(): Promise<InterconnectorReference[]> {
  return cached ??= fetch('/api/elexon/reference/bmunits/all')
    .then(async response => {
      if (!response.ok) throw new Error(`Interconnector reference: HTTP ${response.status}`)
      const raw: unknown = await response.json()
      if (!Array.isArray(raw)) throw new Error('Invalid interconnector reference')
      const references = parseInterconnectorReference(raw)
      if (references.length === 0) throw new Error('No interconnector reference data available')
      return references
    })
    .catch(error => { cached = undefined; throw error })
}
