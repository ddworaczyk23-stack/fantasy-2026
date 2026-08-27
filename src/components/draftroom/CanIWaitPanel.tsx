import type { WaitAnalysis } from '../../types'
import Panel from '../Panel'
import PositionPill from '../PositionPill'
import VerdictChip from '../VerdictChip'
import EmptyState from '../EmptyState'

export default function CanIWaitPanel({ waitAnalysis }: { waitAnalysis: WaitAnalysis[] }) {
  return (
    <Panel title="Can I Wait?" subtitle="Survival odds for your current targets" scroll>
      {waitAnalysis.length === 0 ? (
        <EmptyState title="No targets analysed" description="Once players are available this panel will show survival odds to your next pick." />
      ) : (
        <div className="flex-col">
          {waitAnalysis.map((w) => (
            <div key={w.playerId} className="slot-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <PositionPill position={w.position} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="font-bold">{w.playerName}</div>
                <div className="text-xs text-dim mt-sm">{w.explanation}</div>
              </div>
              <div className="flex-col gap-sm" style={{ alignItems: 'flex-end' }}>
                <VerdictChip verdict={w.verdict} />
                <span className="text-xs text-muted">{Math.round(w.survivalProbability * 100)}% survives</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
