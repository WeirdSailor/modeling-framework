'use client'

import { useRef } from 'react'

export interface TweakState {
  theme: 'light' | 'dark'
  layout: 'three-col' | 'stacked'
  showSidebar: boolean
  selectionPattern: 'buttons' | 'click'
}

interface Props {
  tweaks: TweakState
  onChangeTweak: <K extends keyof TweakState>(key: K, value: TweakState[K]) => void
  onClose: () => void
}

function SegControl<T extends string>({
  value, options, onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const n = options.length
  const idx = Math.max(0, options.findIndex(o => o.value === value))
  return (
    <div className="twk-seg">
      <div
        className="twk-seg-thumb"
        style={{
          left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
          width: `calc((100% - 4px) / ${n})`,
        }}
      />
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="twk-toggle"
      data-on={value ? '1' : '0'}
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
    >
      <i />
    </button>
  )
}

export default function TweaksPanel({ tweaks, onChangeTweak, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef({ x: 16, y: 16 })

  const onDragStart = (e: React.MouseEvent) => {
    const panel = panelRef.current
    if (!panel) return
    const r = panel.getBoundingClientRect()
    const sx = e.clientX, sy = e.clientY
    const startRight  = window.innerWidth  - r.right
    const startBottom = window.innerHeight - r.bottom
    const move = (ev: MouseEvent) => {
      offsetRef.current = {
        x: startRight  - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      }
      panel.style.right  = offsetRef.current.x + 'px'
      panel.style.bottom = offsetRef.current.y + 'px'
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      ref={panelRef}
      className="twk-panel"
      style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}
    >
      <div className="twk-hd" onMouseDown={onDragStart}>
        <b>Tweaks</b>
        <button
          className="twk-x"
          aria-label="Close tweaks"
          onMouseDown={e => e.stopPropagation()}
          onClick={onClose}
        >✕</button>
      </div>
      <div className="twk-body">
        <div className="twk-sect">Theme</div>
        <SegControl
          value={tweaks.theme}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark',  label: 'Dark' },
          ]}
          onChange={v => onChangeTweak('theme', v)}
        />

        <div className="twk-sect">Layout</div>
        <SegControl
          value={tweaks.layout}
          options={[
            { value: 'three-col', label: 'Side by side' },
            { value: 'stacked',   label: 'Stacked' },
          ]}
          onChange={v => onChangeTweak('layout', v)}
        />
        <div className="twk-row twk-row-h">
          <div className="twk-lbl"><span>Drafts sidebar</span></div>
          <Toggle value={tweaks.showSidebar} onChange={v => onChangeTweak('showSidebar', v)} />
        </div>

        <div className="twk-sect">Selection</div>
        <SegControl
          value={tweaks.selectionPattern}
          options={[
            { value: 'buttons', label: 'Buttons' },
            { value: 'click',   label: 'Click' },
          ]}
          onChange={v => onChangeTweak('selectionPattern', v)}
        />
      </div>
    </div>
  )
}
