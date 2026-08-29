import type { DraftPick, LeagueTeam, Player, LeagueSettings } from '../../types'
import { roundForPick, indexInRound } from '../../engine/picks'
import Panel from '../Panel'
import EmptyState from '../EmptyState'

function indexInRoundLocal(pickNumber: number, teams: number): number {
  return indexInRound(pickNumber, teams)
}

export default function DraftHistoryPanel({
  picks,
  players,
  teams,
  settings,
  onUndo,
}: {
  picks: DraftPick[]
  players: Player[]
  teams: LeagueTeam[]
  settings: LeagueSettings
  onUndo: () => void
}) {
  const playerById = new Map(players.map((p) => [p.id, p]))
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const ordered = [...picks].sort((a, b) => b.pickNumber - a.pickNumber)

  return (
    <Panel title="Draft History" subtitle={`${picks.length} pick${picks.length === 1 ? '' : 's'} made`} scroll>
      {picks.length === 0 ? (
        <EmptyState title="No picks yet" description="Picks will appear here as the draft progresses." />
      ) : (
        <>
          <button type="button" onClick={onUndo} className="btn btn-sm">
            Undo last pick
          </button>
          <div className="flex-col mt-sm">
            {ordered.map((pick) => {
              const player = playerById.get(pick.playerId)
              const team = teamById.get(pick.teamId)
              const round = roundForPick(pick.pickNumber, settings.teams)
              const idx = indexInRoundLocal(pick.pickNumber, settings.teams)
              return (
                <div key={pick.pickNumber} className="slot-row">
                  <span className="text-xs text-muted" style={{ minWidth: 46 }}>
                    {round}.{String(idx).padStart(2, '0')}
                  </span>
                  <span className="font-bold" style={{ minWidth: 110 }}>
                    {team ? team.name : pick.teamId}
                  </span>
                  <span>{player ? player.name : pick.playerId}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}
