import type { Position } from '../types'

export default function PositionPill({ position }: { position: Position }) {
  return <span className={`pos-pill pos-${position}`}>{position}</span>
}
