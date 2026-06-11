'use client'

import { useEffect, useRef } from 'react'
import { GSP_AREAS } from '@/config/scenarios'

export function usePopoverDismiss(
  popoverRef: React.RefObject<HTMLDivElement | null>,
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        wrapperRef.current && !wrapperRef.current.contains(e.target as Node)
      ) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])
}

export function GspFilterPopover({ gspFilter, onChange, onClose, wrapperRef }: {
  gspFilter: Record<string, 'include' | 'exclude'>
  onChange: (f: Record<string, 'include' | 'exclude'>) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, wrapperRef, onClose)

  function setZone(id: string, seg: 'include' | 'exclude' | null) {
    const next = { ...gspFilter }
    if (seg === null) delete next[id]; else next[id] = seg
    onChange(next)
  }

  const includedIds = Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k)
  const excludedIds = Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k)

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
      background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: 268, overflow: 'hidden',
    }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>GSP Groups</span>
        <button style={{ background: 'none', border: 0, color: '#6366f1', fontSize: 11, cursor: 'pointer', padding: '0 2px' }} onClick={() => onChange({})}>Clear all</button>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {GSP_AREAS.map(area => {
          const state = gspFilter[area.id] ?? null
          return (
            <div key={area.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 12px', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{area.label}</span>
              <div style={{ display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 5, overflow: 'hidden', flexShrink: 0 }}>
                {(['include', null, 'exclude'] as const).map((seg, i) => {
                  const active = state === seg
                  const lbl = seg === 'include' ? '+' : seg === 'exclude' ? '−' : '·'
                  let bg = 'var(--bg-panel)', color = 'var(--text-faint)'
                  if (active && seg === 'include') { bg = 'rgba(5,150,105,.15)'; color = '#6ee7b7' }
                  if (active && seg === null)      { bg = 'var(--bg-subtle)';    color = 'var(--text)' }
                  if (active && seg === 'exclude') { bg = 'rgba(220,38,38,.15)'; color = '#fca5a5' }
                  return (
                    <button key={i} style={{
                      padding: '3px 8px', fontSize: 11, fontWeight: 600, background: bg, color,
                      border: 'none', borderRight: i < 2 ? '1px solid var(--border-strong)' : 'none',
                      cursor: 'pointer', lineHeight: 1.4,
                    }} aria-pressed={active} onClick={() => setZone(area.id, seg)}>{lbl}</button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {(includedIds.length > 0 || excludedIds.length > 0) && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)' }}>
          {includedIds.length > 0 && <span>Showing: <span style={{ color: '#6ee7b7' }}>{includedIds.join(', ')}</span></span>}
          {includedIds.length > 0 && excludedIds.length > 0 && <span style={{ margin: '0 6px' }}>·</span>}
          {excludedIds.length > 0 && <span>Hiding: <span style={{ color: '#fca5a5' }}>{excludedIds.join(', ')}</span></span>}
        </div>
      )}
    </div>
  )
}
