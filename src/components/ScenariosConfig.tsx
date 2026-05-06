'use client'

import { useState } from 'react'
import { SCENARIOS, GSP_AREAS, type ScenarioId } from '@/config/scenarios'

interface Props {
  voltageArea: string
  onVoltageAreaChange: (area: string) => void
}

export default function ScenariosConfig({ voltageArea, onVoltageAreaChange }: Props) {
  const [expanded, setExpanded] = useState<ScenarioId | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          Scenario Configuration
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-soft)' }}>
          Scenarios rank Available units by different operational criteria. Click a card to expand its full description. Criteria will be wired to live sorting in a future update.
        </p>
      </div>

      {/* Scenario cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SCENARIOS.map(sc => {
          const isOpen = expanded === sc.id
          return (
            <div
              key={sc.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-panel)',
                overflow: 'hidden',
              }}
            >
              {/* Card header — always visible */}
              <button
                onClick={() => setExpanded(isOpen ? null : sc.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text)',
                }}
              >
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  color: 'var(--accent)',
                  minWidth: 72,
                }}>
                  {sc.name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-soft)', flex: 1 }}>
                  {sc.shortDescription}
                </span>
                {sc.supportsArea && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--text-faint)',
                    background: 'var(--bg-row-alt)', padding: '2px 6px', borderRadius: 4,
                  }}>
                    Area
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 4 }}>
                  {isOpen ? '▲' : '▼'}
                </span>
              </button>

              {/* Expanded body */}
              {isOpen && (
                <div style={{
                  padding: '0 14px 14px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}>
                  <Field label="Description">{sc.description}</Field>
                  <Field label="Ranking basis">
                    <code style={{ fontFamily: 'var(--font-roboto-mono, monospace)', fontSize: 11.5 }}>
                      {sc.rankingBasis}
                    </code>
                  </Field>
                  {sc.unitPreference && (
                    <Field label="Unit preference">{sc.unitPreference}</Field>
                  )}
                  <Field label="Best for">{sc.bestFor}</Field>

                  {/* Voltage area selector */}
                  {sc.supportsArea && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)', minWidth: 100 }}>
                        Area
                      </span>
                      <select
                        value={voltageArea}
                        onChange={e => onVoltageAreaChange(e.target.value)}
                        style={{
                          fontSize: 12,
                          padding: '4px 8px',
                          borderRadius: 'var(--radius)',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-input)',
                          color: 'var(--text)',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">All areas</option>
                        {GSP_AREAS.map(a => (
                          <option key={a.id} value={a.id}>{a.label}</option>
                        ))}
                      </select>
                      {voltageArea && (
                        <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                          Units in {voltageArea} will rank first
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      <div style={{
        padding: '10px 20px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        fontSize: 11.5,
        color: 'var(--text-faint)',
        fontStyle: 'italic',
      }}>
        Scenario criteria are indicative — descriptions capture current thinking and can be refined here as operational understanding develops.
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '.05em',
        color: 'var(--text-faint)',
        minWidth: 100,
        paddingTop: 1,
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--text-soft)', lineHeight: 1.55 }}>
        {children}
      </span>
    </div>
  )
}
