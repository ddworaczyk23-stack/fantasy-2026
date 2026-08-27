import type { Recommendation } from '../../types'
import PositionPill from '../PositionPill'
import StatBar from '../StatBar'
import ProfileChip from '../ProfileChip'
import Chip from '../Chip'
import EmptyState from '../EmptyState'

const CONFIDENCE_LABEL: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }

export default function DraftNowCard({
  recommendation,
  onDraft,
  clockTeamName,
}: {
  recommendation: Recommendation
  onDraft: (playerId: string) => void
  clockTeamName: string
}) {
  if (!recommendation.onTheClock) {
    return (
      <div className="panel draft-now" aria-label="Draft Now">
        <div className="panel__header">
          <h2 className="panel__title">Draft Now</h2>
        </div>
        <div className="panel__body">
          <EmptyState
            title="Not on the clock"
            description={`${clockTeamName || 'Another team'} is picking now. ${
              recommendation.picksUntilNext > 0
                ? `${recommendation.picksUntilNext} pick${recommendation.picksUntilNext === 1 ? '' : 's'} until your turn (pick ${
                    recommendation.myNextPick ?? '—'
                  }).`
                : 'You are up next.'
            }`}
          />
        </div>
      </div>
    )
  }

  const primary = recommendation.primary
  if (!primary) {
    return (
      <div className="panel draft-now" aria-label="Draft Now">
        <div className="panel__header">
          <h2 className="panel__title">Draft Now</h2>
        </div>
        <div className="panel__body">
          <EmptyState
            title="No players available"
            description="Every player on the board has been drafted, or your filters have excluded everyone. Check Rankings or Settings to load a board."
          />
        </div>
      </div>
    )
  }

  const p = primary.player

  return (
    <div className="panel draft-now" aria-label="Draft Now">
      <div className="panel__header">
        <h2 className="panel__title">Draft Now</h2>
        <Chip tone="accent">{CONFIDENCE_LABEL[primary.confidence]}</Chip>
      </div>
      <div className="panel__body">
        <div className="draft-now__player">
          <span className="draft-now__name">{p.name}</span>
          <PositionPill position={p.position} />
          <span className="draft-now__meta">
            {p.team} · Bye {p.bye || '—'} · Tier {p.tier}
          </span>
          <ProfileChip profile={primary.profile} />
        </div>

        <div className="draft-now__stats">
          <div className="stat-box">
            <div className="stat-box__label">Overall rank</div>
            <div className="stat-box__value">#{p.overallRank}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box__label">Pos rank</div>
            <div className="stat-box__value">
              {p.position}{p.posRank}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-box__label">ADP</div>
            <div className="stat-box__value">{p.adp.toFixed(1)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box__label">Proj pts</div>
            <div className="stat-box__value">{Math.round(p.projPoints)}</div>
          </div>
        </div>

        <StatBar label="Draft Score" value={primary.score} valueLabel={`${Math.round(primary.score)} / 100`} />

        {primary.riskFlags.length > 0 && (
          <div className="flex-row flex-wrap mt-sm">
            {primary.riskFlags.map((flag) => (
              <Chip tone="warn" icon="⚠" key={flag}>
                {flag}
              </Chip>
            ))}
          </div>
        )}

        {primary.reasons.length > 0 && (
          <ul className="reasons-list">
            {primary.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="btn btn-primary btn-block mt-md"
          style={{ fontSize: '1.05rem', padding: '12px' }}
          onClick={() => onDraft(p.id)}
        >
          DRAFT {p.name.toUpperCase()}
        </button>
      </div>
    </div>
  )
}
