import type { NonoPose } from '../../store/NonoMascot'

// Hat box per pose, in % of the mascot image (measured on the WebP art):
// the brim sits on the forehead, clear of the eyes; the top may overhang.
const PLACE: Record<NonoPose, { left: number; top: number; width: number; rotate: number }> = {
  wave: { left: 20, top: -13, width: 52, rotate: -10 },
  standing: { left: 18, top: -9, width: 50, rotate: -9 },
  heart: { left: 20, top: -6, width: 54, rotate: -5 },
  glasses: { left: 24, top: 0, width: 50, rotate: -6 },
}

/** Santa hat in Hot Pink over Nono's head, drawn in code. */
export default function NonoHat({ pose }: { pose: NonoPose }) {
  const p = PLACE[pose]
  return (
    <svg
      viewBox="0 0 120 84"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute overflow-visible"
      style={{ left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, transform: `rotate(${p.rotate}deg)` }}
      data-testid="nono-natal-hat"
    >
      <g stroke="#1B1B1F" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round">
        <path d="M16 62C20 36 40 10 70 8c20-1 36 10 40 32-6-6-14-10-20-8-6 2-4 14 8 30Z" fill="#F04080" />
        <path d="M30 60c6-20 20-38 38-42" fill="none" stroke="#C42A62" strokeWidth={5} opacity={0.55} />
        <rect x={6} y={55} width={100} height={18} rx={9} fill="#FFFFFF" />
        <circle cx={110} cy={44} r={11} fill="#FFFFFF" />
      </g>
      <g fill="#DFE6EE">
        <path d="M12 68h88a9 9 0 0 1-7 4H19a9 9 0 0 1-7-4Z" />
        <circle cx={113} cy={48} r={5} />
      </g>
    </svg>
  )
}
