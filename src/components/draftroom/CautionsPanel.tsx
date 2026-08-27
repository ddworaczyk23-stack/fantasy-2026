import type { Caution } from '../../types'
import Panel from '../Panel'
import { SeverityChip } from '../Chip'
import EmptyState from '../EmptyState'

export default function CautionsPanel({ cautions }: { cautions: Caution[] }) {
  return (
    <Panel title="Avoid / Caution">
      {cautions.length === 0 ? (
        <EmptyState title="Nothing flagged" description="No current cautions against your targets." />
      ) : (
        <div className="flex-col">
          {cautions.map((c) => (
            <div key={c.playerId} className="slot-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="font-bold">{c.playerName}</div>
                <div className="text-xs text-dim mt-sm">{c.message}</div>
                <div className="text-xs text-muted mt-sm">{c.realisticRange}</div>
              </div>
              <SeverityChip severity={c.severity}>{c.severity}</SeverityChip>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
