import { POSITIONS } from '../types'
import type { DraftRoomRead, EngineContext, PositionalRun, Position, TeamNeed } from '../types'
import { interveningPicks, teamForPick } from './picks'
import { teamNeeds } from './roster'

const RUN_THRESHOLD: Record<Position, number> = {
  QB: 3,
  RB: 4,
  WR: 4,
  TE: 3,
  DST: 2,
  K: 2,
}

/** Positional runs over the last `window` picks made in the draft. */
export function detectRuns(ctx: EngineContext, window = 8): PositionalRun[] {
  const playerById = new Map(ctx.players.map((p) => [p.id, p]))
  const recent = ctx.picks.slice(-window)
  const counts = new Map<Position, number>()
  for (const pick of recent) {
    const player = playerById.get(pick.playerId)
    if (!player) continue
    counts.set(player.position, (counts.get(player.position) ?? 0) + 1)
  }
  return POSITIONS.map((position) => {
    const countInWindow = counts.get(position) ?? 0
    return {
      position,
      countInWindow,
      window,
      active: countInWindow >= RUN_THRESHOLD[position],
    }
  })
}

export function readDraftRoom(ctx: EngineContext): DraftRoomRead {
  const allTeamNeeds = teamNeeds(ctx)
  const teamNeedsById = new Map(allTeamNeeds.map((t) => [t.teamId, t]))
  const runs = detectRuns(ctx)
  const activeRunPositions = new Set(runs.filter((r) => r.active).map((r) => r.position))

  const intervening = interveningPicks(ctx)
  const seen = new Set<string>()
  const teamsBeforeNextPick: TeamNeed[] = []
  for (const pickNum of intervening) {
    const team = teamForPick(pickNum, ctx.teams, ctx.settings)
    if (!team || seen.has(team.id)) continue
    seen.add(team.id)
    const tn = teamNeedsById.get(team.id)
    if (tn) teamsBeforeNextPick.push(tn)
  }

  const expectedMap = new Map<Position, number>()
  for (const pickNum of intervening) {
    const team = teamForPick(pickNum, ctx.teams, ctx.settings)
    if (!team) continue
    const tn = teamNeedsById.get(team.id)
    if (!tn) continue
    const [first, second] = tn.needs
    if (first) expectedMap.set(first, (expectedMap.get(first) ?? 0) + 1.0)
    if (second) expectedMap.set(second, (expectedMap.get(second) ?? 0) + 0.35)
  }
  const positionsLikelyGone = POSITIONS.map((position) => {
    let expected = expectedMap.get(position) ?? 0
    if (activeRunPositions.has(position)) expected *= 1.25
    return { position, expected: Math.round(expected * 10) / 10 }
  })
    .filter((x) => x.expected > 0)
    .sort((a, b) => b.expected - a.expected)

  const summary: string[] = []

  if (intervening.length === 0) {
    summary.push('No teams pick before your next selection — you are up again immediately.')
  } else {
    const needCounts = new Map<Position, number>()
    for (const tn of teamsBeforeNextPick) {
      for (const pos of tn.needs) needCounts.set(pos, (needCounts.get(pos) ?? 0) + 1)
    }
    let topPos: Position | null = null
    let topCount = 0
    for (const [pos, count] of needCounts) {
      if (count > topCount) {
        topCount = count
        topPos = pos
      }
    }
    if (topPos && topCount > 0) {
      summary.push(
        `${topCount} of the ${teamsBeforeNextPick.length} teams picking before you still need a ${topPos}, so do not expect this ${topPos} tier to return.`,
      )
    }
    summary.push(
      `${intervening.length} picks happen before your next selection, across ${teamsBeforeNextPick.length} teams.`,
    )
  }

  for (const run of runs) {
    if (run.active) {
      summary.push(
        `${run.position} run is active: ${run.countInWindow} of the last ${run.window} picks were ${run.position}.`,
      )
    }
  }

  if (positionsLikelyGone.length > 0) {
    const top = positionsLikelyGone[0]
    summary.push(`Expect roughly ${top.expected} more ${top.position}${top.position === 'DST' ? '' : 's'} gone before your next pick.`)
  }

  return {
    teamNeeds: allTeamNeeds,
    runs,
    teamsBeforeNextPick,
    positionsLikelyGone,
    summary: summary.slice(0, 5),
  }
}
