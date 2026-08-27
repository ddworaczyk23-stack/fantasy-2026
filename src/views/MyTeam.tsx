import { useMemo } from 'react'
import { useDraftStore, useEngineContext, useRecommendation } from '../store/draftStore'
import { availablePlayers } from '../engine'
import { POSITIONS } from '../types'
import type { Player, Position } from '../types'
import Panel from '../components/Panel'
import PositionPill from '../components/PositionPill'
import StatBar from '../components/StatBar'
import EmptyState from '../components/EmptyState'
import Chip from '../components/Chip'

export default function MyTeam() {
  const players = useDraftStore((s) => s.players)
  const ctx = useEngineContext()
  const recommendation = useRecommendation()
  const roster = recommendation.roster

  const available = useMemo(() => availablePlayers(ctx), [ctx])

  const targetsByNeed = useMemo(() => {
    const groups: { position: Position; players: Player[] }[] = []
    for (const pos of roster.needs) {
      const top = available.filter((p) => p.position === pos).slice(0, 5)
      if (top.length > 0) groups.push({ position: pos, players: top })
    }
    return groups
  }, [available, roster.needs])

  if (players.length === 0) {
    return (
      <EmptyState
        title="No players loaded"
        description="Load the bundled sample board from Settings, or import a CSV in Rankings, to see your team here."
      />
    )
  }

  const maxCount = Math.max(1, ...POSITIONS.map((p) => roster.counts[p] ?? 0))

  return (
    <div className="draft-room">
      <div className="draft-room__col">
        <Panel title="Starters" subtitle={`Projected ${Math.round(roster.starterPoints)} pts`}>
          <div className="slot-list">
            {roster.starters.map((slot) => (
              <div key={slot.key} className={`slot-row ${slot.player ? '' : 'slot-row--empty'}`}>
                <span className="slot-row__key">{slot.key}</span>
                {slot.player ? (
                  <>
                    <PositionPill position={slot.player.position} />
                    <span className="slot-row__name">{slot.player.name}</span>
                    <span className="slot-row__meta">
                      Bye {slot.player.bye || '—'} · Tier {slot.player.tier}
                    </span>
                  </>
                ) : (
                  <span>Unfilled — need {slot.position}</span>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Bench" subtitle={`${roster.bench.length} player${roster.bench.length === 1 ? '' : 's'}`}>
          {roster.bench.length === 0 ? (
            <EmptyState title="Empty bench" description="No bench players drafted yet." />
          ) : (
            <div className="slot-list">
              {roster.bench.map((p) => (
                <div key={p.id} className="slot-row">
                  <PositionPill position={p.position} />
                  <span className="slot-row__name">{p.name}</span>
                  <span className="slot-row__meta">Bye {p.bye || '—'} · Tier {p.tier}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Positional Depth Chart">
          <div className="flex-col">
            {POSITIONS.map((pos) => (
              <StatBar
                key={pos}
                label={pos}
                value={roster.counts[pos] ?? 0}
                max={maxCount}
                valueLabel={String(roster.counts[pos] ?? 0)}
              />
            ))}
          </div>
        </Panel>
      </div>

      <div className="draft-room__col">
        <Panel title="Build Style" subtitle={roster.buildStyle}>
          <p className="text-dim text-sm">
            Your roster currently reads as <strong>{roster.buildStyle}</strong>. The engine is
            leaning toward a <strong>{roster.focus}</strong>-focused pick strategy for your next
            selection based on this build.
          </p>
        </Panel>

        <Panel title="Bye-Week Overview" subtitle="Weeks with 2+ starters out">
          {roster.byeConflicts.length === 0 ? (
            <EmptyState title="No bye conflicts" description="No week currently has multiple starters on bye." />
          ) : (
            <div className="flex-col">
              {roster.byeConflicts.map((c) => (
                <div key={c.week} className="slot-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <Chip tone="warn" icon="⚠">
                    Week {c.week}
                  </Chip>
                  <div className="flex-row flex-wrap gap-sm">
                    {c.players.map((p) => (
                      <span key={p.id} className="text-sm text-dim">
                        {p.name} ({p.position})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Strengths & Vulnerabilities">
          <div className="text-xs text-muted font-bold">STRENGTHS</div>
          {roster.strengths.length === 0 ? (
            <p className="text-muted text-sm mt-sm">None identified yet.</p>
          ) : (
            <ul className="reasons-list">
              {roster.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          <div className="text-xs text-muted font-bold mt-md">VULNERABILITIES</div>
          {roster.vulnerabilities.length === 0 ? (
            <p className="text-muted text-sm mt-sm">None identified yet.</p>
          ) : (
            <ul className="reasons-list">
              {roster.vulnerabilities.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="draft-room__col">
        <Panel title="Next-Pick Priorities">
          {(['next1', 'next2', 'next3'] as const).map((key, i) => (
            <div key={key} className="mt-sm">
              <div className="text-xs text-muted font-bold">PICK {i + 1}</div>
              <div className="flex-row flex-wrap mt-sm">
                {roster.priorities[key].length === 0 ? (
                  <span className="text-muted text-sm">No strong need</span>
                ) : (
                  roster.priorities[key].map((pos) => <PositionPill key={pos} position={pos} />)
                )}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Suggested Future Targets" subtitle="Top available by position at your needs" scroll>
          {targetsByNeed.length === 0 ? (
            <EmptyState title="No pressing needs" description="Your roster doesn't have an unfilled starter need right now." />
          ) : (
            <div className="flex-col">
              {targetsByNeed.map((group) => (
                <div key={group.position} className="mt-sm">
                  <div className="flex-row">
                    <PositionPill position={group.position} />
                    <span className="text-xs text-muted font-bold">TOP AVAILABLE</span>
                  </div>
                  <div className="slot-list mt-sm">
                    {group.players.map((p) => (
                      <div key={p.id} className="slot-row">
                        <span className="slot-row__name">{p.name}</span>
                        <span className="slot-row__meta">
                          Tier {p.tier} · ADP {p.adp.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
