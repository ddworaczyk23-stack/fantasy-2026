import type { LeagueTeam, ScoredPlayer } from '../types'
import PositionPill from './PositionPill'

function valueClass(value: number): string {
  if (value >= 5) return 'text-good font-bold'
  if (value <= -5) return 'text-critical font-bold'
  return 'text-muted'
}

/**
 * One row in the Available Players table. Kept as a component so DraftRoom
 * stays under the line budget and so the row markup/behaviour is defined once.
 */
export default function PlayerRow({
  rank,
  scored,
  teams,
  onDraft,
  onMarkDrafted,
  shortcutHint,
}: {
  rank: number
  scored: ScoredPlayer
  teams: LeagueTeam[]
  onDraft: () => void
  onMarkDrafted: (teamId: string) => void
  shortcutHint?: number
}) {
  const p = scored.player
  return (
    <tr>
      <td>{rank}</td>
      <td>
        <span className="font-bold">{p.name}</span>
        {shortcutHint !== undefined && <span className="kbd text-xs ml-sm">{shortcutHint}</span>}
      </td>
      <td>
        <PositionPill position={p.position} />
      </td>
      <td>{p.team}</td>
      <td>{p.bye || '—'}</td>
      <td>T{p.tier}</td>
      <td>{p.adp.toFixed(1)}</td>
      <td className={valueClass(scored.valueVsAdp)}>
        {scored.valueVsAdp > 0 ? '+' : ''}
        {scored.valueVsAdp.toFixed(1)}
      </td>
      <td>{Math.round(p.projPoints)}</td>
      <td className="font-bold">{Math.round(scored.score)}</td>
      <td>
        <div className="flex-row gap-sm">
          <button type="button" className="btn btn-sm btn-primary" onClick={onDraft}>
            Draft
          </button>
          <label className="sr-only" htmlFor={`mark-drafted-${p.id}`}>
            Mark {p.name} drafted by
          </label>
          <select
            id={`mark-drafted-${p.id}`}
            className="btn-sm"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                onMarkDrafted(e.target.value)
                e.target.value = ''
              }
            }}
            aria-label={`Mark ${p.name} drafted by another team`}
          >
            <option value="" disabled>
              Mark drafted by…
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isMe ? ' (me)' : ''}
              </option>
            ))}
          </select>
        </div>
      </td>
    </tr>
  )
}
