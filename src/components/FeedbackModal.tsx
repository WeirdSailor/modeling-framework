'use client'

import { useEffect, useState } from 'react'
import { loadFeedbackItems, saveFeedbackItem } from '@/services/feedbackSync'

export interface FeedbackItem {
  id: string
  name: string
  observation: string
  desiredFunctionality: string
  businessValue: 'High' | 'Medium' | 'Low'
  date: string
}

interface Props {
  onClose: () => void
}

export default function FeedbackModal({ onClose }: Props) {
  const [view, setView] = useState<'form' | 'table'>('form')
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [observation, setObservation] = useState('')
  const [desiredFunctionality, setDesiredFunctionality] = useState('')
  const [businessValue, setBusinessValue] = useState<'High' | 'Medium' | 'Low'>('Medium')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setLoading(true)
    loadFeedbackItems().then(data => {
      setItems(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit() {
    if (!observation.trim()) return
    const payload = {
      name: name.trim() || 'Anonymous',
      observation: observation.trim(),
      desiredFunctionality: desiredFunctionality.trim(),
      businessValue,
      date: new Date().toISOString().slice(0, 10),
    }
    const id = await saveFeedbackItem(payload)
    const item: FeedbackItem = { id: id ?? Date.now().toString(), ...payload }
    setItems(prev => [item, ...prev])
    setName('')
    setObservation('')
    setDesiredFunctionality('')
    setBusinessValue('Medium')
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 2500)
  }

  const bvColour = (bv: string) =>
    bv === 'High' ? '#ef4444' : bv === 'Medium' ? '#f59e0b' : '#22c55e'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-pop)',
          width: view === 'table' ? 820 : 480,
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px 12px',
          borderBottom: '1px solid var(--border)',
          gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
              {view === 'form' ? 'Submit Feedback' : 'Feedback Log'}
            </span>
            <span style={{
              background: 'var(--bg-subtle)', color: 'var(--text-muted)',
              borderRadius: 10, fontSize: 11, padding: '1px 7px',
            }}>
              {items.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => setView(v => v === 'form' ? 'table' : 'form')}
            >
              {view === 'form' ? 'View Feedback' : '+ New Feedback'}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Form view */}
        {view === 'form' && (
          <div style={{ padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Your name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Alex Smith"
                maxLength={80}
                style={{
                  fontSize: 13, padding: '6px 9px',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  background: 'var(--bg)', color: 'var(--text)', outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                Observation / Feedback <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={observation}
                onChange={e => setObservation(e.target.value)}
                placeholder="Describe what you observed or what isn't working well…"
                maxLength={1000}
                rows={5}
                style={{
                  fontSize: 13, padding: '6px 9px', resize: 'vertical',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  background: 'var(--bg)', color: 'var(--text)', outline: 'none',
                  fontFamily: 'inherit', lineHeight: 1.5,
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
                {observation.length}/1000
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Desired Functionality</label>
              <textarea
                value={desiredFunctionality}
                onChange={e => setDesiredFunctionality(e.target.value)}
                placeholder="What would you like the system to do instead?"
                maxLength={1000}
                rows={4}
                style={{
                  fontSize: 13, padding: '6px 9px', resize: 'vertical',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  background: 'var(--bg)', color: 'var(--text)', outline: 'none',
                  fontFamily: 'inherit', lineHeight: 1.5,
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Business Value</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['High', 'Medium', 'Low'] as const).map(bv => (
                  <button
                    key={bv}
                    onClick={() => setBusinessValue(bv)}
                    style={{
                      fontSize: 12, padding: '5px 14px',
                      borderRadius: 'var(--radius)',
                      border: businessValue === bv ? `1.5px solid ${bvColour(bv)}` : '1px solid var(--border)',
                      background: businessValue === bv ? `${bvColour(bv)}18` : 'var(--bg)',
                      color: businessValue === bv ? bvColour(bv) : 'var(--text-muted)',
                      cursor: 'pointer', fontWeight: businessValue === bv ? 600 : 400,
                      transition: 'all .15s',
                    }}
                  >
                    {bv}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Date: {new Date().toISOString().slice(0, 10)}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {submitted && (
                  <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 500 }}>
                    ✓ Submitted
                  </span>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 12 }}
                  onClick={handleSubmit}
                  disabled={!observation.trim()}
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table view */}
        {view === 'table' && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No feedback submitted yet.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-subtle)', position: 'sticky', top: 0 }}>
                    <th style={th}>Date</th>
                    <th style={th}>Name</th>
                    <th style={th}>Value</th>
                    <th style={{ ...th, width: '30%' }}>Observation</th>
                    <th style={{ ...th, width: '30%' }}>Desired Functionality</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-subtle)' }}>
                      <td style={td}>{item.date}</td>
                      <td style={td}>{item.name}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: `${bvColour(item.businessValue)}18`,
                          color: bvColour(item.businessValue),
                          border: `1px solid ${bvColour(item.businessValue)}44`,
                        }}>
                          {item.businessValue}
                        </span>
                      </td>
                      <td style={{ ...td, whiteSpace: 'pre-wrap', maxWidth: 220 }}>{item.observation}</td>
                      <td style={{ ...td, whiteSpace: 'pre-wrap', maxWidth: 220 }}>{item.desiredFunctionality || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600,
  color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '7px 10px', color: 'var(--text)',
  borderBottom: '1px solid var(--border)', verticalAlign: 'top',
}
