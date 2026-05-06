// Scenario definitions — edit these to refine criteria over time.
// Ranking logic is descriptive for now; will be wired to actual sort functions later.

export interface ScenarioConfig {
  id: ScenarioId
  name: string
  shortDescription: string   // one-liner shown in the dropdown
  description: string        // full explanation shown on the config page
  rankingBasis: string       // what the sort is based on
  bestFor: string            // when to use this scenario
  unitPreference?: string    // preferred fuel types / unit characteristics
  supportsArea?: boolean     // whether an area/GSP filter applies (Voltage only for now)
}

export type ScenarioId =
  | 'none'
  | 'margin'
  | 'inertia'
  | 'voltage'
  | 'reserve'
  | 'response'
  | 'pullback'

export const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'margin',
    name: 'Margin',
    shortDescription: 'Maximise available MW',
    description:
      'Identifies units that can contribute the most additional generation capacity to close a margin deficit. Prioritises units with the largest gap between their current output (PN) and their maximum export limit (MEL).',
    rankingBasis: 'Available MW (MEL − PN) descending',
    bestFor:
      'National Grid Margin Notices, LOLP events, or any situation where total system generation needs to be increased quickly.',
    unitPreference: 'All dispatchable types; largest thermal and hydro units rank highest.',
  },
  {
    id: 'inertia',
    name: 'Inertia',
    shortDescription: 'Large synchronous machines',
    description:
      'Targets large synchronous generators whose rotating mass contributes inertia to the system. Inertia slows the Rate of Change of Frequency (RoCoF) following a sudden generation loss, buying time for frequency response services to act.',
    rankingBasis: 'Synchronous fuel types first (CCGT, Coal, Nuclear, OCGT, NPSHYD, PS), then registered capacity descending',
    bestFor:
      'Low-inertia operating conditions — typically high renewable penetration periods where wind and solar displace synchronous plant.',
    unitPreference: 'CCGT, Coal, Nuclear, OCGT, Pumped Storage, Hydro. Wind and solar excluded (non-synchronous).',
  },
  {
    id: 'voltage',
    name: 'Voltage',
    shortDescription: 'Reactive power / area support',
    description:
      'Surfaces units that can provide reactive power support in a specific geographic area. Voltage issues are highly localised — a unit in the wrong part of the network provides little help. Filtering by area (GSP group) focuses selection on units electrically close to the constraint.',
    rankingBasis: 'Units in selected area first (by GSP group), then registered capacity descending within area, then other areas',
    bestFor:
      'Low-voltage events, post-fault voltage recovery, or pre-emptive voltage management ahead of large demand pick-up or generation loss in a specific area.',
    unitPreference: 'Units with AVR capability preferred; large CCGTs and nuclear within the affected GSP group.',
    supportsArea: true,
  },
  {
    id: 'reserve',
    name: 'Reserve',
    shortDescription: 'Short-notice MW, minutes timescale',
    description:
      'Ranks units by how quickly they can be instructed and begin loading — their Notice to Deviate from Zero (NDZ). Reserve services typically require response on a minutes timescale. Units with the shortest NDZ can be called last-minute and still deliver within the window.',
    rankingBasis: 'NDZ ascending (shortest notice first), then available MW (MEL − PN) descending as tiebreak',
    bestFor:
      'Covering loss of a large infeed, pre-fault reserve requirements, or topping up margin when the system is tight and time is limited.',
    unitPreference: 'OCGT, Pumped Storage, fast-start CCGTs. Units with NDZ < 30 minutes are most useful.',
  },
  {
    id: 'response',
    name: 'Response',
    shortDescription: 'Sub-minute frequency response',
    description:
      'Focuses on units capable of providing primary or secondary frequency response — output changes within seconds to minutes of a frequency deviation. These units are crucial for arresting frequency falls before they breach limits.',
    rankingBasis: 'Preferred response types first (PS, NPSHYD, OCGT), then NDZ ascending, then available MW descending',
    bestFor:
      'Low-frequency events, defence against sudden generation loss, or supplementing Dynamic Containment / Dynamic Moderation coverage.',
    unitPreference: 'Pumped Storage and Hydro are ideal (instantaneous response). Fast OCGTs are next best. CCGTs can contribute but with a lag.',
  },
  {
    id: 'pullback',
    name: 'Pullback',
    shortDescription: 'Units with most to reduce',
    description:
      'Identifies units that are generating significantly above their Stable Export Limit (SEL), meaning they have the largest range of output they could reduce. Useful when system frequency is high or there is excess generation that needs to be curtailed in a controlled way.',
    rankingBasis: 'Headroom above SEL (PN − SEL) descending — units furthest above their minimum stable output can give back the most MW',
    bestFor:
      'High-frequency conditions, over-generation events, or when the system needs to absorb excess renewable output by backing down thermal generation.',
    unitPreference: 'Units currently generating well above SEL. Nuclear is typically excluded (inflexible). CCGTs and coal have the most room to reduce.',
  },
]

// GSP group → region name mapping for the Voltage area selector
export const GSP_AREAS: { id: string; label: string }[] = [
  { id: '_A', label: '_A — East England' },
  { id: '_B', label: '_B — East Midlands' },
  { id: '_C', label: '_C — London' },
  { id: '_D', label: '_D — Mersey & North Wales' },
  { id: '_E', label: '_E — Midlands' },
  { id: '_F', label: '_F — North Scotland' },
  { id: '_G', label: '_G — South Scotland' },
  { id: '_H', label: '_H — South East England' },
  { id: '_J', label: '_J — South Wales' },
  { id: '_K', label: '_K — South West England' },
  { id: '_L', label: '_L — Southern England' },
  { id: '_M', label: '_M — Yorkshire' },
  { id: '_N', label: '_N — North West England' },
  { id: '_P', label: '_P — Northern England' },
]
