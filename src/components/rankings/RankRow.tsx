import type { Player, PlayerTag } from '../../types'
import PositionPill from '../PositionPill'

export const ALL_TAGS: PlayerTag[] = [
  'target',
  'fade',
  'avoid-at-cost',
  'sleeper',
  'injury-concern',
  'value',
  'handcuff',
  'pass-catcher',
  'high-target',
]

export default function RankRow({
  player,
  effectiveRank,
  onSetCustomRank,
  onClearCustomRank,
  onMove,
  onToggleTag,
  onSetTier,
}: {
  player: Player
  effectiveRank: number
  onSetCustomRank: (value: number | null) => void
  onClearCustomRank: () => void
  onMove: (delta: number) => void
  onToggleTag: (tag: PlayerTag) => void
  onSetTier: (tier: number) => void
}) {
  return (
    <tr className={player.customRank !== null ? 'row-mine' : ''}>
      <td>{effectiveRank}</td>
      <td className="font-bold">{player.name}</td>
      <td>
        <PositionPill position={player.position} />
      </td>
      <td>{player.team}</td>
      <td>
        <input
          type="number"
          style={{ width: 66 }}
          value={player.tier}
          onChange={(e) => onSetTier(Number(e.target.value) || 0)}
          aria-label={`Tier for ${player.name}`}
        />
      </td>
      <td>{player.adp.toFixed(1)}</td>
      <td>
        <div className="flex-row gap-sm">
          <input
            type="number"
            style={{ width: 70 }}
            value={player.customRank ?? ''}
            placeholder={String(player.overallRank)}
            onChange={(e) => {
              const v = e.target.value
              onSetCustomRank(v === '' ? null : Number(v))
            }}
            aria-label={`Custom rank for ${player.name}`}
          />
          {player.customRank !== null && (
            <button type="button" className="btn btn-sm" onClick={onClearCustomRank} aria-label={`Clear override for ${player.name}`}>
              Clear
            </button>
          )}
        </div>
      </td>
      <td>
        <div className="flex-row gap-sm">
          <button type="button" className="btn btn-sm" onClick={() => onMove(-1)} aria-label={`Move ${player.name} up`}>
            ↑
          </button>
          <button type="button" className="btn btn-sm" onClick={() => onMove(1)} aria-label={`Move ${player.name} down`}>
            ↓
          </button>
        </div>
      </td>
      <td>
        <div className="filter-chips">
          {ALL_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className="filter-chip"
              aria-pressed={player.tags.includes(tag)}
              onClick={() => onToggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </td>
    </tr>
  )
}
