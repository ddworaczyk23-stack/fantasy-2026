import { useState, useMemo } from 'react'
import type { DraftPick, LeagueSettings, LeagueTeam, Player } from '../../types'
import { slotForPick } from '../../engine/picks'
import Panel from '../Panel'

export default function DraftBoardPanel({
  picks,
  players,
  teams,
  settings,
}: {
  picks: DraftPick[]
  players: Player[]
  teams: LeagueTeam[]
  settings: LeagueSettings
}) {
  const [open, setOpen] = useState(false)
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  const orderedTeams = useMemo(() => [...teams].sort((a, b) => a.slot - b.slot), [teams])

  const rounds = Math.max(1, Math.ceil(picks.length / Math.max(1, settings.teams)) || 1)

  const grid: (DraftPick | null)[][] = []
  for (let r = 1; r <= Math.max(rounds, 1); r++) {
    const row: (DraftPick | null)[] = []
    for (const t of orderedTeams) {
      const pickNumber = picks.find((p) => {
        return (
          p.round === r &&
          slotForPick(p.pickNumber, settings) === t.slot
        )
      })
      row.push(pickNumber ?? null)
    }
    grid.push(row)
  }

  return (
    <Panel
      title="Draft Board"
      subtitle="Round-by-team grid"
      right={
        <button type="button" className="btn btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Collapse' : 'Expand'}
        </button>
      }
    >
      {open && (
        <div className="board-grid table-wrap">
          <table className="data-table board-table">
            <thead>
              <tr>
                <th>Rd</th>
                {orderedTeams.map((t) => (
                  <th key={t.id} className={t.isMe ? 'board-col-mine' : ''}>
                    {t.name}
                    {t.isMe ? ' (me)' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, rIdx) => (
                <tr key={rIdx}>
                  <td>{rIdx + 1}</td>
                  {row.map((pick, cIdx) => {
                    const team = orderedTeams[cIdx]
                    const player = pick ? playerById.get(pick.playerId) : null
                    return (
                      <td key={cIdx} className={team.isMe ? 'board-col-mine' : ''}>
                        {player ? player.name : pick ? pick.playerId : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
