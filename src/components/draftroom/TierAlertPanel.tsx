import type { TierAlert } from '../../types'
import Panel from '../Panel'
import PositionPill from '../PositionPill'
import { SeverityChip } from '../Chip'
import EmptyState from '../EmptyState'

export default function TierAlertPanel({ alerts }: { alerts: TierAlert[] }) {
  return (
    <Panel title="Tier Alert" subtitle="Remaining players in the current value tier">
      {alerts.length === 0 ? (
        <EmptyState title="No tier pressure" description="No position is running low in its current tier right now." />
      ) : (
        <div className="flex-col">
          {alerts.map((a, i) => (
            <div key={`${a.position}-${a.tier}-${i}`} className="slot-row" style={{ alignItems: 'flex-start' }}>
              <PositionPill position={a.position} />
              <div style={{ flex: 1 }}>
                <div className="text-sm text-dim">{a.message}</div>
              </div>
              <SeverityChip severity={a.severity}>
                {a.remaining} left
              </SeverityChip>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
