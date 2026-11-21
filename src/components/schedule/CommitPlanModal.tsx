'use client'

// Commit dialog for the working plan (spec §8.3). Same look as ConfirmModal.

import { useEffect, useState } from 'react'

interface Props {
  actionCount: number
  onCommit: (name: string, description: string) => void
  onCancel: () => void
}

export default function CommitPlanModal({ actionCount, onCommit, onCancel }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const canCommit = name.trim().length > 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <form
        role="dialog" aria-modal="true" aria-label="Commit working plan"
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (canCommit) onCommit(name.trim(), description.trim()) }}
        style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-pop)', padding: '20px 22px 16px', width: 380,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text)', fontWeight: 600 }}>
          Commit {actionCount} action{actionCount === 1 ? '' : 's'}
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          Name
          <input className="reason-select" style={{ border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'text', padding: '6px 8px' }} autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Evening margin cover" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          Description
          <textarea className="reason-select" style={{ border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'text', padding: '6px 8px', resize: 'vertical' }} rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!canCommit}>Commit</button>
        </div>
      </form>
    </div>
  )
}
