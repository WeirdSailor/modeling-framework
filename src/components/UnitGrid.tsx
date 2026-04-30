'use client'

import { useMemo } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import type { ColDef, SelectionChangedEvent } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import { useModellingStore } from '@/store/useModellingStore'
import { isUnitCommitted } from '@/utils/margin'

ModuleRegistry.registerModules([AllCommunityModule])

const EXCLUDED_FUEL_TYPES = new Set([
  'WIND',
  'SOLAR',
  'INTNEM',
  'INTFR',
  'INTIRL',
  'INTEW',
  'INTNED',
  'INTIFA2',
  'INTELEC',
])

interface GridRow {
  bmUnitId: string
  fuelType: string
  registeredCapacity: number
  melMW: number
  currentPN: number
  incrementalMW: number
  sel: number | null
  ndz: number | null
  mnzt: number | null
  gspGroup: string
  isModelled: boolean
}

const columnDefs: ColDef<GridRow>[] = [
  {
    headerName: '',
    checkboxSelection: true,
    headerCheckboxSelection: false,
    width: 50,
    pinned: 'left',
    sortable: false,
    filter: false,
    resizable: false,
  },
  {
    field: 'bmUnitId',
    headerName: 'BMU ID',
    width: 130,
    pinned: 'left',
  },
  {
    field: 'fuelType',
    headerName: 'Fuel Type',
    width: 100,
  },
  {
    field: 'registeredCapacity',
    headerName: 'Cap (MW)',
    width: 90,
    type: 'numericColumn',
    valueFormatter: (p) => p.value?.toFixed(0) ?? '',
  },
  {
    field: 'melMW',
    headerName: 'MEL (MW)',
    width: 90,
    type: 'numericColumn',
    valueFormatter: (p) => p.value?.toFixed(0) ?? '',
  },
  {
    field: 'currentPN',
    headerName: 'PN (MW)',
    width: 90,
    type: 'numericColumn',
    valueFormatter: (p) => p.value?.toFixed(0) ?? '',
  },
  {
    field: 'incrementalMW',
    headerName: 'Inc. MW',
    width: 90,
    type: 'numericColumn',
    sort: 'desc',
    valueFormatter: (p) => p.value?.toFixed(0) ?? '',
  },
  {
    field: 'sel',
    headerName: 'SEL (MW)',
    width: 90,
    type: 'numericColumn',
    valueFormatter: (p) => (p.value != null ? p.value.toFixed(0) : 'N/A'),
  },
  {
    field: 'ndz',
    headerName: 'NDZ (min)',
    width: 90,
    valueFormatter: (p) => (p.value != null ? String(p.value) : 'N/A'),
  },
  {
    field: 'mnzt',
    headerName: 'MNZT (min)',
    width: 90,
    valueFormatter: (p) => (p.value != null ? String(p.value) : 'N/A'),
  },
  {
    field: 'gspGroup',
    headerName: 'GSP Group',
    width: 90,
  },
]

const defaultColDef: ColDef<GridRow> = {
  sortable: true,
  filter: true,
  resizable: true,
}

export default function UnitGrid() {
  const units = useModellingStore((state) => state.units)
  const modellingActions = useModellingStore((state) => state.modellingActions)
  const selectedUnits = useModellingStore((state) => state.selectedUnits)
  const toggleUnitSelection = useModellingStore((state) => state.toggleUnitSelection)
  const settlementPeriods = useModellingStore((state) => state.settlementPeriods)

  const rowData = useMemo<GridRow[]>(() => {
    return units
      .filter((unit) => {
        // Exclude renewable/interconnector fuel types (melMW check happens after mapping)
        if (EXCLUDED_FUEL_TYPES.has(unit.fuelType)) return false
        return true
      })
      .map((unit) => {
        let melMW = 0
        let currentPN = 0

        for (const sp of settlementPeriods) {
          const spMel = sp.mel[unit.bmUnitId] ?? 0
          const spPn = sp.pn[unit.bmUnitId] ?? 0
          if (spMel > melMW) melMW = spMel
          if (spPn > currentPN) currentPN = spPn
        }

        const isModelled = modellingActions.some(
          (action) => action.bmUnitId === unit.bmUnitId,
        )

        return {
          bmUnitId: unit.bmUnitId,
          fuelType: unit.fuelType,
          registeredCapacity: unit.registeredCapacity,
          melMW,
          currentPN,
          incrementalMW: melMW - currentPN,
          sel: unit.sel ?? null,
          ndz: unit.ndz ?? null,
          mnzt: unit.mnzt ?? null,
          gspGroup: unit.gspGroup,
          isModelled,
        }
      })
      .filter((row) => {
        // Filter out units where MEL is not positive
        if (row.melMW <= 0) return false
        // Filter out units that are originally committed (PN > 1 MW for any SP)
        const isCommitted = settlementPeriods.some((sp) =>
          isUnitCommitted(row.bmUnitId, sp, []),
        )
        return !isCommitted
      })
  }, [units, modellingActions, settlementPeriods])

  const handleSelectionChanged = (event: SelectionChangedEvent<GridRow>) => {
    const selectedIds = new Set(
      event.api.getSelectedRows().map((r: GridRow) => r.bmUnitId),
    )
    selectedIds.forEach((id) => {
      if (!selectedUnits.has(id)) toggleUnitSelection(id)
    })
    selectedUnits.forEach((id) => {
      if (!selectedIds.has(id)) toggleUnitSelection(id)
    })
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      {units.length === 0 ? (
        <div className="h-full flex items-center justify-center text-gray-400">
          Loading units...
        </div>
      ) : (
        <div className="ag-theme-alpine h-full w-full">
          <AgGridReact<GridRow>
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowSelection="multiple"
            getRowStyle={(params) => {
              if (params.data?.isModelled) return { background: '#dbeafe' }
              return undefined
            }}
            onSelectionChanged={handleSelectionChanged}
          />
        </div>
      )}
    </div>
  )
}
