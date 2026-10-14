// Shared <defs>, rendered once per page (spec §4: hatch pattern defined once, not per row).

export const HATCH_ID = 'd2-hatch'
export const HATCH_FILL = `url(#${HATCH_ID})`

export default function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <pattern id={HATCH_ID} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="rgba(255,107,74,.22)" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,107,74,.8)" strokeWidth="2" />
        </pattern>
      </defs>
    </svg>
  )
}
