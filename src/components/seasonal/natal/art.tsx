/**
 * Christmas shapes drawn in code, in the brand palette: Hot Pink and Pop
 * Yellow stay the lead colours, pine green only supports. Decorative only.
 */
const NATAL = {
  pink: '#F04080',
  pinkDark: '#C42A62',
  yellow: '#FCBE04',
  pine: '#1F7A4D',
  pineLight: '#2E9E63',
  snow: '#FFFFFF',
  ink: '#1B1B1F',
} as const

/** Holly sprig in a 32×24 box: two leaves and three pink berries. */
export function HollyShape() {
  return (
    <g strokeLinejoin="round">
      <path
        d="M16 14C12 9 6 10 2 6c1 4-1 6 1 9 2-1 4 0 5 2 2-2 5-1 8-3Z"
        fill={NATAL.pineLight}
        stroke={NATAL.pine}
        strokeWidth={1}
      />
      <path
        d="M16 14c4-5 10-4 14-8-1 4 1 6-1 9-2-1-4 0-5 2-2-2-5-1-8-3Z"
        fill={NATAL.pineLight}
        stroke={NATAL.pine}
        strokeWidth={1}
      />
      <circle cx={13.5} cy={16.5} r={3} fill={NATAL.pink} stroke={NATAL.pinkDark} strokeWidth={0.8} />
      <circle cx={18.5} cy={16.5} r={3} fill={NATAL.pink} stroke={NATAL.pinkDark} strokeWidth={0.8} />
      <circle cx={16} cy={20.5} r={3} fill={NATAL.pink} stroke={NATAL.pinkDark} strokeWidth={0.8} />
    </g>
  )
}

/** Five-point star in a 24×24 box. */
export function StarShape() {
  return (
    <path
      d="M12 1.5l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.3l-6.2 3.3L7 13.7 2 8.8l6.9-1Z"
      fill={NATAL.yellow}
      stroke="#C99600"
      strokeWidth={1}
      strokeLinejoin="round"
    />
  )
}

/** Gift box in a 24×24 box: pink paper, yellow ribbon and bow. */
export function GiftShape() {
  return (
    <g strokeLinejoin="round">
      <rect x={3} y={10} width={18} height={12} rx={1.5} fill={NATAL.pink} stroke={NATAL.pinkDark} strokeWidth={1} />
      <rect x={2} y={7} width={20} height={4.5} rx={1.2} fill={NATAL.pink} stroke={NATAL.pinkDark} strokeWidth={1} />
      <rect x={10.5} y={7} width={3} height={15} fill={NATAL.yellow} />
      <path d="M12 7C9 2 4 3 6 6c1 1.4 4 1 6 1Zm0 0c3-5 8-4 6-1-1 1.4-4 1-6 1Z" fill={NATAL.yellow} stroke="#C99600" strokeWidth={0.8} />
    </g>
  )
}

/** Six-arm snowflake in a 24×24 box (stroke only). */
export function SnowflakeShape() {
  return (
    <g stroke={NATAL.snow} strokeWidth={1.6} strokeLinecap="round" fill="none">
      {[0, 60, 120].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 12 12)`}>
          <path d="M12 2v20M12 5.5 9.5 3.5M12 5.5l2.5-2M12 18.5l-2.5 2M12 18.5l2.5 2" />
        </g>
      ))}
    </g>
  )
}
