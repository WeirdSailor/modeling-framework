'use client'

import { useCallback, useState } from 'react'
import {
  AREA_SOURCES, AREA_SOURCES_STORAGE_KEY, type AreaSource, type AreaSources,
} from '../dashboard.config'
import type { AreaId } from '../types'

// Stored overrides are merged over the AREA_SOURCES defaults, so an area added later (or a
// malformed entry) falls back to its default instead of breaking the dashboard.
function readStoredSources(): AreaSources {
  const merged: AreaSources = { ...AREA_SOURCES }
  try {
    const raw = window.localStorage.getItem(AREA_SOURCES_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') {
      for (const id of Object.keys(merged) as AreaId[]) {
        const v = (parsed as Record<string, unknown>)[id]
        if (v === 'real' || v === 'mock') merged[id] = v
      }
    }
  } catch { /* storage unavailable or malformed */ }
  return merged
}

function storeSources(sources: AreaSources) {
  try { window.localStorage.setItem(AREA_SOURCES_STORAGE_KEY, JSON.stringify(sources)) } catch { /* storage unavailable */ }
}

/** Per-area Real/Mock choice for Dashboard 2, persisted to localStorage. */
export function useAreaSources() {
  const [sources, setSources] = useState<AreaSources>(readStoredSources)

  const setSource = useCallback((id: AreaId, source: AreaSource) => {
    setSources(prev => {
      const next = { ...prev, [id]: source }
      storeSources(next)
      return next
    })
  }, [])

  const resetSources = useCallback(() => {
    try { window.localStorage.removeItem(AREA_SOURCES_STORAGE_KEY) } catch { /* storage unavailable */ }
    setSources({ ...AREA_SOURCES })
  }, [])

  return { sources, setSource, resetSources }
}
