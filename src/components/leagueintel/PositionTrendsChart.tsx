import { POSITIONS } from '../../types'
import type { DraftPick, Player } from '../../types'

export default function PositionTrendsChart({
  picks,
  players,
  rounds,
}: {
  picks: DraftPick[]
  players: Player[]
  rounds: number
}) {
  const playerById = new Map(players.map((p) => [p.id, p]))

  const byRound: Record<number, Record<string, number>> = {}
  for (const pick of picks) {
    const player = playerById.get(pick.playerId)
    if (!player) continue
    byRound[pick.round] ??= {}
    byRound[pick.round][player.position] = (byRound[pick.round][player.position] ?? 0) + 1
  }

  const roundNumbers = Array.from({ length: rounds }, (_, i) => i + 1).filter((r) => byRound[r])

  if (roundNumbers.length === 0) {
    return <p className="text-muted text-sm">No picks made yet — trends will appear once the draft starts.</p>
  }

  return (
    <div className="mini-bar-chart">
      {roundNumbers.map((r) => {
        const counts = byRound[r]
        const total = Object.values(counts).reduce((a, b) => a + b, 0)
        return (
          <div className="mini-bar-row" key={r}>
            <span className="text-xs text-muted">Round {r}</span>
            <div className="mini-bar-track">
              {POSITIONS.map((pos) => {
                const n = counts[pos] ?? 0
                if (n === 0) return null
                return (
                  <div
                    key={pos}
                    className="mini-bar-seg"
                    style={{ width: `${(n / total) * 100}%`, background: `var(--pos-${pos.toLowerCase()})` }}
                    title={`${pos}: ${n}`}
                  />
                )
              })}
            </div>
            <span className="text-xs text-muted">{total}</span>
          </div>
        )
      })}
      <div className="flex-row flex-wrap mt-sm">
        {POSITIONS.map((pos) => (
          <span key={pos} className="text-xs flex-row gap-sm">
            <span
              aria-hidden="true"
              style={{ width: 10, height: 10, display: 'inline-block', background: `var(--pos-${pos.toLowerCase()})`, borderRadius: 2 }}
            />
            {pos}
          </span>
        ))}
      </div>
    </div>
  )
}
