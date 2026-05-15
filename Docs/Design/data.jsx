// BMU seed data — 30 units modelled loosely on UK Balancing Mechanism unit IDs
// PN  = Physical Notification (MW)
// MEL = Maximum Export Limit (MW)
// SEL = Stable Export Limit (MW)
// PRICE = £/MWh

const SEED_BMUS = [
  { id: "T_DRAXX-1",  type: "Biomass",    site: "Drax",            pn: 645, mel: 660, sel: 270, price: 82.40 },
  { id: "T_DRAXX-2",  type: "Biomass",    site: "Drax",            pn: 638, mel: 660, sel: 270, price: 83.10 },
  { id: "T_DRAXX-3",  type: "Biomass",    site: "Drax",            pn: 0,   mel: 660, sel: 270, price: 79.95 },
  { id: "T_DRAXX-4",  type: "Biomass",    site: "Drax",            pn: 612, mel: 660, sel: 270, price: 84.20 },
  { id: "T_PEHE-1",   type: "CCGT",       site: "Pembroke",        pn: 480, mel: 530, sel: 220, price: 96.75 },
  { id: "T_PEHE-2",   type: "CCGT",       site: "Pembroke",        pn: 510, mel: 530, sel: 220, price: 97.20 },
  { id: "T_PEHE-3",   type: "CCGT",       site: "Pembroke",        pn: 495, mel: 530, sel: 220, price: 96.10 },
  { id: "T_STAY-1",   type: "CCGT",       site: "Staythorpe",      pn: 360, mel: 410, sel: 180, price: 102.50 },
  { id: "T_STAY-2",   type: "CCGT",       site: "Staythorpe",      pn: 0,   mel: 410, sel: 180, price: 105.00 },
  { id: "T_GRAI-6",   type: "CCGT",       site: "Grain",           pn: 410, mel: 430, sel: 200, price: 99.40 },
  { id: "T_GRAI-7",   type: "CCGT",       site: "Grain",           pn: 415, mel: 430, sel: 200, price: 99.80 },
  { id: "T_GRAI-8",   type: "CCGT",       site: "Grain",           pn: 290, mel: 430, sel: 200, price: 100.25 },
  { id: "T_HEYM-1",   type: "Nuclear",    site: "Heysham",         pn: 580, mel: 600, sel: 480, price: 48.30 },
  { id: "T_HEYM-2",   type: "Nuclear",    site: "Heysham",         pn: 590, mel: 600, sel: 480, price: 48.30 },
  { id: "T_HRSTW-1",  type: "Wind",       site: "Hornsea Two",     pn: 720, mel: 1320, sel: 0,  price: 35.00 },
  { id: "T_HRSTW-2",  type: "Wind",       site: "Hornsea Two",     pn: 680, mel: 1320, sel: 0,  price: 35.00 },
  { id: "T_DBSTW-1",  type: "Wind",       site: "Dogger Bank A",   pn: 540, mel: 1200, sel: 0,  price: 38.50 },
  { id: "T_GANW-13",  type: "Wind",       site: "Gwynt y Môr",     pn: 220, mel: 576, sel: 0,   price: 40.10 },
  { id: "T_BEATW-1",  type: "Wind",       site: "Beatrice",        pn: 310, mel: 588, sel: 0,   price: 39.20 },
  { id: "T_DNGB-1",   type: "Battery",    type_short: "BESS",      site: "Dollymans",       pn: 0,   mel: 100, sel: 0, price: 145.00 },
  { id: "T_PILB-1",   type: "Battery",    site: "Pillswood",       pn: 0,   mel: 196, sel: 0,   price: 138.00 },
  { id: "T_MNZB-1",   type: "Battery",    site: "Minety",          pn: 0,   mel: 150, sel: 0,   price: 142.50 },
  { id: "T_DINO-1",   type: "Pumped",     site: "Dinorwig",        pn: 0,   mel: 288, sel: 50,  price: 165.75 },
  { id: "T_DINO-2",   type: "Pumped",     site: "Dinorwig",        pn: 0,   mel: 288, sel: 50,  price: 165.75 },
  { id: "T_FFES-1",   type: "Pumped",     site: "Ffestiniog",      pn: 0,   mel: 90,  sel: 20,  price: 168.40 },
  { id: "T_CRUA-1",   type: "Pumped",     site: "Cruachan",        pn: 0,   mel: 110, sel: 25,  price: 162.10 },
  { id: "T_KEAD-2",   type: "OCGT",       site: "Keadby",          pn: 0,   mel: 735, sel: 280, price: 178.20 },
  { id: "T_COSO-1",   type: "OCGT",       site: "Cottam",          pn: 0,   mel: 305, sel: 120, price: 182.50 },
  { id: "T_RCBKO-1",  type: "Interconn.", site: "IFA",             pn: 1400, mel: 2000, sel: 0, price: 72.30 },
  { id: "T_NEMO-1",   type: "Interconn.", site: "Nemo Link",       pn: 800, mel: 1000, sel: 0,  price: 75.80 },
];

// Settlement periods today + tomorrow (UK uses 48 half-hours per day)
function buildSettlementOptions() {
  const opts = [];
  const days = ["Today", "Tomorrow"];
  for (let d = 0; d < 2; d++) {
    for (let p = 1; p <= 48; p++) {
      const totalMin = (p - 1) * 30;
      const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
      const mm = String(totalMin % 60).padStart(2, "0");
      opts.push({
        day: days[d],
        period: p,
        label: `${days[d]} · SP ${p} · ${hh}:${mm}`,
        time: `${hh}:${mm}`,
      });
    }
  }
  return opts;
}

const SETTLEMENT_OPTIONS = buildSettlementOptions();

// Three pre-built drafts
const SEED_DRAFTS = [
  {
    id: "drft_001",
    name: "Evening peak cover",
    state: "draft",
    fromKey: "Today|34", // 16:30
    toKey:   "Today|40", // 19:30
    selected: [
      { bmuId: "T_DRAXX-1", notes: "Lead unit — full output expected" },
      { bmuId: "T_PEHE-2",  notes: "Backup if wind drops below 1.2GW" },
      { bmuId: "T_DINO-1",  notes: "Fast response, 5 min ramp" },
    ],
    createdAt: Date.now() - 1000 * 60 * 22,
  },
  {
    id: "drft_002",
    name: "Overnight wind curtailment",
    state: "draft",
    fromKey: "Tomorrow|3",  // 01:00
    toKey:   "Tomorrow|11", // 05:00
    selected: [
      { bmuId: "T_HRSTW-1", notes: "Curtail 200MW per ESO instruction" },
      { bmuId: "T_DBSTW-1", notes: "" },
    ],
    createdAt: Date.now() - 1000 * 60 * 60 * 3,
  },
  {
    id: "drft_003",
    name: "Morning ramp standby",
    state: "committed",
    fromKey: "Tomorrow|13", // 06:00
    toKey:   "Tomorrow|19", // 09:00
    selected: [
      { bmuId: "T_GRAI-6", notes: "" },
      { bmuId: "T_STAY-1", notes: "Synchronised by 05:30" },
      { bmuId: "T_KEAD-2", notes: "Hot standby only" },
      { bmuId: "T_PILB-1", notes: "Frequency response" },
    ],
    createdAt: Date.now() - 1000 * 60 * 60 * 8,
  },
];

window.SEED_BMUS = SEED_BMUS;
window.SEED_DRAFTS = SEED_DRAFTS;
window.SETTLEMENT_OPTIONS = SETTLEMENT_OPTIONS;
