import { useMemo } from 'react'
import { useDraftStore, useEngineContext, useRecommendation } from '../store/draftStore'
import { availablePlayers, teamNeeds, canIWait } from '../engine'
import Panel from '../components/Panel'
import EmptyState from '../components/EmptyState'
import PositionPill from '../components/PositionPill'
import VerdictChip from '../components/VerdictChip'
import TeamRosterCard from '../components/leagueintel/TeamRosterCard'
import PositionTrendsChart from '../components/leagueintel/PositionTrendsChart'

const LIKELY_GONE_LIMIT = 15

export default function LeagueIntel() {
  const players = useDraftStore((s) => s.players)
  const picks = useDraftStore((s) => s.picks)
  const teams = useDraftStore((s) => s.teams)
  const settings = useDraftStore((s) => s.settings)

  const ctx = useEngineContext()
  const recommendation = useRecommendation()

  const needs = useMemo(() => teamNeeds(ctx), [ctx])
  const available = useMemo(() => availablePlayers(ctx), [ctx])

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  const rosterByTeam = useMemo(() => {
    const map = new Map<string, typeof players>()
    for (const t of teams) map.set(t.id, [])
    for (const pick of picks) {
      const player = playerById.get(pick.playerId)
      if (!player) continue
      const arr = map.get(pick.teamId)
      if (arr) arr.push(player)
    }
    return map
  }, [teams, picks, playerById, players])

  const variance = useMemo(() => {
    const rows = picks
      .map((pick) => {
        const player = playerById.get(pick.playerId)
        if (!player || !player.adp) return null
        return { pick, player, delta: pick.pickNumber - player.adp }
      })
      .filter((r): r is { pick: (typeof picks)[number]; player: NonNullable<ReturnType<typeof playerById.get>>; delta: number } => r !== null)

    const reaches = [...rows].sort((a, b) => a.delta - b.delta).slice(0, 6)
    const fallers = [...rows].sort((a, b) => b.delta - a.delta).slice(0, 6)
    return { reaches, fallers }
  }, [picks, playerById])

  const likelyGoneSoon = useMemo(() => {
    return available
      .slice(0, LIKELY_GONE_LIMIT)
      .map((p) => canIWait(p, ctx))
      .filter((w) => w.verdict === 'take-now' || w.verdict === 'likely-gone')
      .sort((a, b) => a.survivalProbability - b.survivalProbability)
  }, [available, ctx])

  const targetPosition = recommendation.primary?.player.position ?? null
  const competingTeams = useMemo(() => {
    if (!targetPosition) return []
    return needs
      .filter((n) => !teams.find((t) => t.id === n.teamId)?.isMe && n.needs.includes(targetPosition))
      .map((n) => ({ ...n, priority: n.needs.indexOf(targetPosition) }))
      .sort((a, b) => a.priority - b.priority)
  }, [needs, targetPosition, teams])

  if (players.length === 0) {
    return (
      <EmptyState
        title="No players loaded"
        description="Load the bundled sample board from Settings to see league-wide intel."
      />
    )
  }

  return (
    <div className="draft-room">
      <div className="draft-room__col" style={{ gridColumn: 'span 2' }}>
        <Panel title="Every Team — Roster & Needs" tall>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {[...teams]
              .sort((a, b) => a.slot - b.slot)
              .map((t) => (
                <TeamRosterCard
                  key={t.id}
                  team={t}
                  need={needs.find((n) => n.teamId === t.id)}
                  roster={rosterByTeam.get(t.id) ?? []}
                />
              ))}
          </div>
        </Panel>

        <Panel title="Position Drafting Trends" subtitle="Picks by position, by round">
          <PositionTrendsChart picks={picks} players={players} rounds={settings.rounds} />
        </Panel>
      </div>

      <div className="draft-room__col">
        <Panel title="ADP vs Actual — Biggest Reaches" subtitle="Drafted well ahead of ADP">
          {variance.reaches.length === 0 ? (
            <EmptyState title="No picks yet" description="Reaches will show up once picks are made." />
          ) : (
            <div className="flex-col">
              {variance.reaches.map((r) => (
                <div key={r.pick.pickNumber} className="slot-row">
                  <PositionPill position={r.player.position} />
                  <span className="font-bold">{r.player.name}</span>
                  <span className="slot-row__meta">
                    Pick {r.pick.pickNumber} vs ADP {r.player.adp.toFixed(1)} ({r.delta.toFixed(1)})
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="ADP vs Actual — Biggest Fallers" subtitle="Drafted well after ADP">
          {variance.fallers.length === 0 ? (
            <EmptyState title="No picks yet" description="Fallers will show up once picks are made." />
          ) : (
            <div className="flex-col">
              {variance.fallers.map((r) => (
                <div key={r.pick.pickNumber} className="slot-row">
                  <PositionPill position={r.player.position} />
                  <span className="font-bold">{r.player.name}</span>
                  <span className="slot-row__meta">
                    Pick {r.pick.pickNumber} vs ADP {r.player.adp.toFixed(1)} (+{r.delta.toFixed(1)})
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="draft-room__col">
        <Panel title="Likely Gone Before Your Next Pick" subtitle="Top available, evaluated with Can I Wait?" scroll>
          {likelyGoneSoon.length === 0 ? (
            <EmptyState title="Nothing urgent" description="No top-available player looks likely to disappear before your next pick." />
          ) : (
            <div className="flex-col">
              {likelyGoneSoon.map((w) => (
                <div key={w.playerId} className="slot-row" style={{ flexWrap: 'wrap' }}>
                  <PositionPill position={w.position} />
                  <span className="font-bold">{w.playerName}</span>
                  <VerdictChip verdict={w.verdict} />
                  <span className="text-xs text-muted">{Math.round(w.survivalProbability * 100)}% survives</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Competing For Your Target"
          subtitle={targetPosition ? `Teams that also need ${targetPosition}` : 'No current recommendation'}
        >
          {!targetPosition || competingTeams.length === 0 ? (
            <EmptyState title="No competition detected" description="No other team currently lists your target position as a need." />
          ) : (
            <div className="flex-col">
              {competingTeams.map((t) => (
                <div key={t.teamId} className="slot-row">
                  <span className="font-bold" style={{ minWidth: 120 }}>
                    {t.teamName}
                  </span>
                  <span className="text-xs text-muted">Need priority #{t.priority + 1}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
