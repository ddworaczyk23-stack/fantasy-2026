import type { LeagueTeam, Player, TeamNeed } from '../../types'
import PositionPill from '../PositionPill'

export default function TeamRosterCard({
  team,
  need,
  roster,
}: {
  team: LeagueTeam
  need: TeamNeed | undefined
  roster: Player[]
}) {
  return (
    <div className="panel" style={{ minWidth: 0 }}>
      <div className="panel__header">
        <span className="panel__title">
          {team.name}
          {team.isMe ? ' (me)' : ''}
        </span>
        <span className="text-xs text-muted">Slot {team.slot}</span>
      </div>
      <div className="panel__body">
        {roster.length === 0 ? (
          <p className="text-muted text-sm">No picks yet.</p>
        ) : (
          <div className="flex-row flex-wrap gap-sm">
            {roster.map((p) => (
              <span key={p.id} className="text-xs text-dim">
                <PositionPill position={p.position} /> {p.name}
              </span>
            ))}
          </div>
        )}
        {need && need.needs.length > 0 && (
          <div className="mt-sm">
            <span className="text-xs text-muted font-bold">NEEDS </span>
            <div className="flex-row flex-wrap gap-sm mt-sm">
              {need.needs.map((n) => (
                <PositionPill key={n} position={n} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
