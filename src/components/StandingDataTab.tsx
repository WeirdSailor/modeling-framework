'use client'

import { useState, useEffect, useRef } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import {
  loadStandingDataCache,
  getSyncMetadata,
  runBackfill,
  runIncrementalSync,
  computeCoverage,
  type SyncMetadata,
} from '@/services/standingDataSync'

export default function StandingDataTab() {
  const units = useModellingStore(s => s.units)
  const knownIds = units.map(u => u.bmUnitId)
  const total = knownIds.length

  const [metadata, setMetadata] = useState<SyncMetadata | null>(null)
  const [coverage, setCoverage] = useState<{ ndz: number; mzt: number; mnzt: number; sel: number } | null>(null)
  const [running, setRunning] = useState<'backfill' | 'sync' | null>(null)
  const [progress, setProgress] = useState<{ message: string; covered: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function refresh() {
    const [meta, cache] = await Promise.all([getSyncMetadata(), loadStandingDataCache()])
    setMetadata(meta)
    if (knownIds.length > 0) setCoverage(computeCoverage(cache, knownIds))
  }

  useEffect(() => { refresh() }, [total])

  async function handleBackfill() {
    setRunning('backfill')
    abortRef.current = new AbortController()
    try {
      await runBackfill(
        knownIds,
        (message, covered, t) => setProgress({ message, covered, total: t }),
        abortRef.current.signal,
      )
    } finally {
      setRunning(null)
      abortRef.current = null
      setProgress(null)
      refresh()
    }
  }

  async function handleSyncRecent() {
    setRunning('sync')
    try {
      await runIncrementalSync()
    } finally {
      setRunning(null)
      refresh()
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
  }

  const isComplete = metadata?.backfillComplete ?? false

  return (
    <div className="twk-body">
      {/* Status banner */}
      <div style={{ padding: '8px 0 4px' }}>
        {running === 'backfill' ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--text)', margin: '0 0 8px' }}>
              {progress?.message ?? 'Starting backfill...'}{' '}
              {progress && `(${progress.covered}/${progress.total} units)`}
            </p>
            {progress && (
              <div style={{
                height: 4, borderRadius: 2,
                background: 'var(--border)', overflow: 'hidden', marginBottom: 8,
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round((progress.covered / Math.max(progress.total, 1)) * 100)}%`,
                  background: 'var(--accent)',
                  transition: 'width 0.3s',
                }} />
              </div>
            )}
            <button onClick={handleCancel} className="btn" style={{ fontSize: 12 }}>
              Cancel
            </button>
          </>
        ) : !isComplete ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Standing data cache is empty. Run backfill to populate NDZ, MZT, MNZT and SEL
              for all units by searching up to 6 years of Elexon history.
            </p>
            <button
              onClick={handleBackfill}
              disabled={running !== null || total === 0}
              className="btn btn-primary"
              style={{ fontSize: 12 }}
            >
              Run Backfill
            </button>
            {total === 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '6px 0 0' }}>
                Load unit data first (click Refresh in the sidebar).
              </p>
            )}
          </>
        ) : metadata ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Backfill complete (back to {metadata.backfillFrom}).
              {metadata.lastSyncedTo && ` Last synced: ${metadata.lastSyncedTo}.`}
            </p>
            <button
              onClick={handleSyncRecent}
              disabled={running !== null}
              className="btn btn-primary"
              style={{ fontSize: 12 }}
            >
              {running === 'sync' ? 'Syncing...' : 'Sync Recent'}
            </button>
          </>
        ) : null}
      </div>

      {/* Coverage summary */}
      {coverage && total > 0 && (
        <>
          <div className="twk-sect">Coverage</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['ndz', 'mzt', 'mnzt', 'sel'] as const).map(key => (
              <div key={key} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '6px 10px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-row-alt)',
                minWidth: 60,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.06em', color: 'var(--text-faint)', marginBottom: 2,
                }}>
                  {key.toUpperCase()}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                  {coverage[key]}/{total}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
