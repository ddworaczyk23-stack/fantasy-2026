import type { WaitVerdict } from '../types'
import Chip from './Chip'

const VERDICT_META: Record<WaitVerdict, { label: string; tone: 'good' | 'warn' | 'critical' | 'accent'; icon: string }> = {
  'take-now': { label: 'TAKE NOW', tone: 'critical', icon: '⚡' },
  'likely-gone': { label: 'LIKELY GONE', tone: 'warn', icon: '⏳' },
  'possible-value-next-round': { label: 'POSSIBLE VALUE NEXT ROUND', tone: 'accent', icon: '↻' },
  'safe-to-wait': { label: 'SAFE TO WAIT', tone: 'good', icon: '✓' },
}

export default function VerdictChip({ verdict }: { verdict: WaitVerdict }) {
  const meta = VERDICT_META[verdict]
  return (
    <Chip tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Chip>
  )
}
