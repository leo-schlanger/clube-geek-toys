import './natal.css'

// One 60×12 tile: a sagging wire and three bulbs (pink, yellow, green).
const BULBS = [
  { x: 10, fill: '#F04080' },
  { x: 30, fill: '#FCBE04' },
  { x: 50, fill: '#2E9E63' },
]

/** String of lights along the bottom of a header. Decorative only. */
export default function NatalLights() {
  return (
    <svg className="natal-lights" width="100%" height="12" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="natal-bulbs" width="60" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 1.5Q10 6 20 1.5T40 1.5T60 1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          {BULBS.map((b) => (
            <g key={b.x}>
              <rect x={b.x - 1.4} y={3.2} width={2.8} height={2} rx={0.5} fill="currentColor" />
              <ellipse cx={b.x} cy={8} rx={2.6} ry={3.4} fill={b.fill} />
            </g>
          ))}
        </pattern>
        <pattern id="natal-glow" width="60" height="12" patternUnits="userSpaceOnUse">
          {BULBS.map((b) => (
            <circle key={b.x} cx={b.x} cy={8} r={5} fill={b.fill} opacity={0.35} />
          ))}
        </pattern>
      </defs>
      <rect className="natal-lights-glow" width="100%" height="12" fill="url(#natal-glow)" />
      <rect width="100%" height="12" fill="url(#natal-bulbs)" />
    </svg>
  )
}
