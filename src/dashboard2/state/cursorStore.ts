'use client'

// One shared cursor store per dashboard (spec §9.2): rows read from it, never compute cursor state
// themselves. Also carries the typed hover payload for a future tooltip layer (spec §9.4).

import { createContext, useContext, useSyncExternalStore } from 'react'
import type { HoverPayload } from '../types'

export interface CursorState {
  hoverMs: number | null  // SP start under the pointer
  pinnedMs: number | null // pinned SP start
  hover: HoverPayload | null
}

export interface CursorStore {
  get(): CursorState
  set(patch: Partial<CursorState>): void
  subscribe(listener: () => void): () => void
}

export function createCursorStore(): CursorStore {
  let state: CursorState = { hoverMs: null, pinnedMs: null, hover: null }
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...patch }
      if (next.hoverMs === state.hoverMs && next.pinnedMs === state.pinnedMs && next.hover === state.hover) return
      state = next
      listeners.forEach(l => l())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export const CursorContext = createContext<CursorStore | null>(null)

export function useCursorStore(): CursorStore {
  const store = useContext(CursorContext)
  if (!store) throw new Error('CursorContext missing')
  return store
}

/** Effective cursor SP start (pinned wins over hover), or null. */
export function useCursorMs(): number | null {
  const store = useCursorStore()
  return useSyncExternalStore(
    store.subscribe,
    () => { const s = store.get(); return s.pinnedMs ?? s.hoverMs },
    () => null,
  )
}
