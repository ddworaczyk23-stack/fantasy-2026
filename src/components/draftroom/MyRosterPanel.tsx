import type { RosterAnalysis } from '../../types'
import Panel from '../Panel'
import PositionPill from '../PositionPill'

export default function MyRosterPanel({ roster }: { roster: RosterAnalysis }) {
  return (
    <Panel title="My Roster" subtitle={roster.buildStyle} scroll>
      <div className="text-xs text-muted font-bold mt-sm">STARTERS</div>
      <div className="slot-list mt-sm">
        {roster.starters.map((slot) => (
          <div key={slot.key} className={`slot-row ${slot.player ? '' : 'slot-row--empty'}`}>
            <span className="slot-row__key">{slot.key}</span>
            {slot.player ? (
              <>
                <PositionPill position={slot.player.position} />
                <span className="slot-row__name">{slot.player.name}</span>
                <span className="slot-row__meta">Bye {slot.player.bye || '—'}</span>
              </>
            ) : (
              <span>Unfilled — need {slot.position}</span>
            )}
          </div>
        ))}
      </div>

      <div className="text-xs text-muted font-bold mt-md">BENCH ({roster.bench.length})</div>
      <div className="slot-list mt-sm">
        {roster.bench.length === 0 && <div className="text-muted text-sm">No bench players yet.</div>}
        {roster.bench.map((p) => (
          <div key={p.id} className="slot-row">
            <PositionPill position={p.position} />
            <span className="slot-row__name">{p.name}</span>
            <span className="slot-row__meta">Bye {p.bye || '—'}</span>
          </div>
        ))}
      </div>

      {roster.needs.length > 0 && (
        <div className="mt-md">
          <div className="text-xs text-muted font-bold">UNFILLED NEEDS</div>
          <div className="flex-row flex-wrap mt-sm">
            {roster.needs.map((n) => (
              <PositionPill key={n} position={n} />
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}
