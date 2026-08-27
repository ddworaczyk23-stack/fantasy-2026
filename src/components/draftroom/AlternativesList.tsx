import type { ScoredPlayer } from '../../types'
import PositionPill from '../PositionPill'
import ProfileChip from '../ProfileChip'
import Panel from '../Panel'
import EmptyState from '../EmptyState'

export default function AlternativesList({
  alternatives,
  onDraft,
}: {
  alternatives: ScoredPlayer[]
  onDraft: (playerId: string) => void
}) {
  return (
    <Panel title="Best Alternatives" subtitle="Other reasonable picks right now">
      {alternatives.length === 0 ? (
        <EmptyState title="No alternatives" description="Nothing else scored close enough to the top pick." />
      ) : (
        <div className="flex-col">
          {alternatives.map((s) => {
            const p = s.player
            return (
              <div key={p.id} className="slot-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <PositionPill position={p.position} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs text-muted">
                    Tier {p.tier} · ADP {p.adp.toFixed(1)} · Score {Math.round(s.score)} · Fit {Math.round(s.fitScore)}
                  </div>
                  {s.reasons[0] && <div className="text-xs text-dim mt-sm">{s.reasons[0]}</div>}
                </div>
                <ProfileChip profile={s.profile} />
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onDraft(p.id)}>
                  Draft
                </button>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
