import { POSITIONS } from '../types'
import type {
  BuildStyle,
  ByeConflict,
  EngineContext,
  Player,
  Position,
  RosterAnalysis,
  StarterSlot,
  TeamNeed,
} from '../types'
import { inKDstWindow, roundForPick } from './picks'

function emptyCounts(): Record<Position, number> {
  const out = {} as Record<Position, number>
  for (const p of POSITIONS) out[p] = 0
  return out
}

interface SlotDef {
  key: string
  position: Position | 'FLEX' | 'SFLEX'
}

function buildSlotDefs(ctx: EngineContext): SlotDef[] {
  const r = ctx.settings.roster
  const defs: SlotDef[] = []
  ;(['QB', 'RB', 'WR', 'TE', 'DST', 'K'] as Position[]).forEach((pos) => {
    const count = r[pos] ?? 0
    for (let i = 1; i <= count; i++) defs.push({ key: `${pos}${i}`, position: pos })
  })
  const flexCount = r.FLEX ?? 0
  for (let i = 1; i <= flexCount; i++) {
    defs.push({ key: flexCount > 1 ? `FLEX${i}` : 'FLEX', position: 'FLEX' })
  }
  if (ctx.settings.superflex) defs.push({ key: 'SFLEX', position: 'SFLEX' })
  return defs
}

/** Fills starter slots greedily by projPoints. Returns starters + leftover bench pool. */
function fillStarters(ctx: EngineContext, teamPlayers: Player[]): { starters: StarterSlot[]; bench: Player[] } {
  const defs = buildSlotDefs(ctx)
  const used = new Set<string>()
  const starters: StarterSlot[] = []

  const byPosSorted = (pos: Position, exclude: Set<string>) =>
    teamPlayers
      .filter((p) => p.position === pos && !exclude.has(p.id))
      .sort((a, b) => b.projPoints - a.projPoints)

  // 1) exact-position slots
  for (const def of defs) {
    if (def.position === 'FLEX' || def.position === 'SFLEX') continue
    const candidates = byPosSorted(def.position, used)
    const pick = candidates[0] ?? null
    if (pick) used.add(pick.id)
    starters.push({ key: def.key, position: def.position, player: pick })
  }

  // 2) FLEX slots: best remaining RB/WR/TE
  const flexPool = () =>
    teamPlayers
      .filter((p) => (p.position === 'RB' || p.position === 'WR' || p.position === 'TE') && !used.has(p.id))
      .sort((a, b) => b.projPoints - a.projPoints)
  for (const def of defs) {
    if (def.position !== 'FLEX') continue
    const pick = flexPool()[0] ?? null
    if (pick) used.add(pick.id)
    starters.push({ key: def.key, position: 'FLEX', player: pick })
  }

  // 3) SFLEX slot: best remaining QB/RB/WR/TE
  const sflexPool = () =>
    teamPlayers
      .filter(
        (p) => (p.position === 'QB' || p.position === 'RB' || p.position === 'WR' || p.position === 'TE') &&
          !used.has(p.id),
      )
      .sort((a, b) => b.projPoints - a.projPoints)
  for (const def of defs) {
    if (def.position !== 'SFLEX') continue
    const pick = sflexPool()[0] ?? null
    if (pick) used.add(pick.id)
    starters.push({ key: def.key, position: 'FLEX', player: pick })
  }

  const bench = teamPlayers.filter((p) => !used.has(p.id))
  return { starters, bench }
}

function unfilledCount(starters: StarterSlot[], pos: Position): number {
  return starters.filter((s) => s.position === pos && s.player === null).length
}

function computeNeeds(starters: StarterSlot[], window: boolean): Position[] {
  const needs: Position[] = []
  const rbWr: Position[] = (['RB', 'WR'] as Position[])
    .filter((p) => unfilledCount(starters, p) > 0)
    .sort((a, b) => unfilledCount(starters, b) - unfilledCount(starters, a))
  needs.push(...rbWr)
  if (unfilledCount(starters, 'TE') > 0) needs.push('TE')
  if (unfilledCount(starters, 'QB') > 0) needs.push('QB')
  if (window) {
    if (unfilledCount(starters, 'DST') > 0) needs.push('DST')
    if (unfilledCount(starters, 'K') > 0) needs.push('K')
  }
  return needs
}

function computeBuildStyle(
  picksCount: number,
  rbCount: number,
  wrCount: number,
  currentRound: number,
  rbRoundsTaken: number[],
): BuildStyle {
  if (picksCount === 0) return 'Empty'

  const fragileRB = currentRound > 5 && rbCount < 2
  const fragileWR = currentRound > 5 && wrCount < 2
  if (fragileRB) return 'Fragile at RB'
  if (fragileWR) return 'Fragile at WR'

  const heroRb = rbCount === 1 && rbRoundsTaken.some((r) => r <= 2) && wrCount >= 2
  if (heroRb) return 'Hero RB'

  const zeroRb = rbCount === 0 && currentRound >= 4 && wrCount >= 3
  if (zeroRb) return 'Zero-RB leaning'

  if (rbCount >= wrCount + 2) return 'RB-heavy'
  if (wrCount >= rbCount + 1 && rbCount >= 1) return 'WR-first balanced'

  return 'Balanced'
}

function computeByeConflicts(starters: StarterSlot[]): ByeConflict[] {
  const byWeek = new Map<number, Player[]>()
  for (const s of starters) {
    if (!s.player || !s.player.bye) continue
    const arr = byWeek.get(s.player.bye)
    if (arr) arr.push(s.player)
    else byWeek.set(s.player.bye, [s.player])
  }
  const conflicts: ByeConflict[] = []
  for (const [week, players] of byWeek) {
    if (players.length >= 2) conflicts.push({ week, players })
  }
  conflicts.sort((a, b) => b.players.length - a.players.length)
  return conflicts
}

function computePriorities(
  needs: Position[],
  currentRound: number,
  totalRounds: number,
  hasQB: boolean,
  superflex: boolean,
): { next1: Position[]; next2: Position[]; next3: Position[] } {
  const lateWindow = currentRound >= totalRounds - 2
  const filtered = needs.filter((p) => {
    if (p === 'QB' && hasQB && !superflex && !lateWindow) return false
    return true
  })
  const base = filtered.length > 0 ? filtered : (['RB', 'WR'] as Position[])
  return {
    next1: base.slice(0, Math.min(2, base.length)),
    next2: base.slice(0, Math.min(3, base.length)),
    next3: base.slice(0, Math.min(4, base.length)),
  }
}

function computeStrengthsVulnerabilities(
  counts: Record<Position, number>,
  buildStyle: BuildStyle,
  byeConflicts: ByeConflict[],
  picksCount: number,
  starterPoints: number,
): { strengths: string[]; vulnerabilities: string[] } {
  const strengths: string[] = []
  const vulnerabilities: string[] = []

  if (counts.RB >= 3) strengths.push(`Deep at RB with ${counts.RB} taken`)
  if (counts.WR >= 3) strengths.push(`Deep at WR with ${counts.WR} taken`)
  if (buildStyle === 'Balanced' || buildStyle === 'WR-first balanced') {
    strengths.push('Balanced construction across RB/WR gives lineup flexibility')
  }
  if (byeConflicts.length === 0 && picksCount >= 4) strengths.push('No bye-week collisions among starters yet')
  if (starterPoints > 0) strengths.push(`Projected starting lineup at ${starterPoints.toFixed(1)} points`)

  if (counts.RB < 2 && picksCount >= 3) vulnerabilities.push(`Thin at RB with only ${counts.RB} taken`)
  if (counts.WR < 2 && picksCount >= 3) vulnerabilities.push(`Thin at WR with only ${counts.WR} taken`)
  if (counts.TE === 0 && picksCount >= 4) vulnerabilities.push('No TE rostered yet')
  if (byeConflicts.length > 0) {
    const top = byeConflicts[0]
    vulnerabilities.push(`${top.players.length} starters share bye week ${top.week}`)
  }
  if (buildStyle.startsWith('Fragile')) vulnerabilities.push(`Build flagged as ${buildStyle}`)

  const strengthsOut = strengths.slice(0, 3)
  const vulnOut = vulnerabilities.slice(0, 3)
  if (picksCount >= 2 && strengthsOut.length === 0) strengthsOut.push('Roster is still taking shape')
  if (picksCount >= 2 && vulnOut.length === 0) vulnOut.push('No major weaknesses identified yet')
  return { strengths: strengthsOut, vulnerabilities: vulnOut }
}

export function analyzeRoster(teamId: string, ctx: EngineContext): RosterAnalysis {
  const teamPicks = ctx.picks.filter((p) => p.teamId === teamId)
  const playerById = new Map(ctx.players.map((p) => [p.id, p]))
  const teamPlayers = teamPicks
    .map((pick) => playerById.get(pick.playerId))
    .filter((p): p is Player => Boolean(p))

  const counts = emptyCounts()
  for (const p of teamPlayers) counts[p.position] += 1

  const { starters, bench } = fillStarters(ctx, teamPlayers)

  const window = inKDstWindow(ctx)
  const needs = computeNeeds(starters, window)

  const currentRound = roundForPick(ctx.currentPick, ctx.settings.teams)
  const rbRoundsTaken = teamPicks
    .filter((pick) => playerById.get(pick.playerId)?.position === 'RB')
    .map((pick) => roundForPick(pick.pickNumber, ctx.settings.teams))
  const buildStyle = computeBuildStyle(teamPicks.length, counts.RB, counts.WR, currentRound, rbRoundsTaken)

  const byeConflicts = computeByeConflicts(starters)

  const priorities = computePriorities(
    needs,
    currentRound,
    ctx.settings.rounds,
    counts.QB >= 1,
    ctx.settings.superflex,
  )

  const starterPoints = starters.reduce((sum, s) => sum + (s.player ? s.player.projPoints : 0), 0)

  let focus: RosterAnalysis['focus']
  if (buildStyle.startsWith('Fragile')) focus = 'floor'
  else if (needs.length > 0 && currentRound > 6) focus = 'need'
  else if (needs.length === 0) focus = 'value'
  else if (currentRound > ctx.settings.rounds / 2) focus = 'upside'
  else focus = 'value'

  const { strengths, vulnerabilities } = computeStrengthsVulnerabilities(
    counts,
    buildStyle,
    byeConflicts,
    teamPicks.length,
    starterPoints,
  )

  return {
    teamId,
    counts,
    starters,
    bench,
    needs,
    buildStyle,
    byeConflicts,
    priorities,
    focus,
    strengths,
    vulnerabilities,
    starterPoints,
  }
}

export function teamNeeds(ctx: EngineContext): TeamNeed[] {
  return ctx.teams.map((team) => {
    const analysis = analyzeRoster(team.id, ctx)
    return {
      teamId: team.id,
      teamName: team.name,
      slot: team.slot,
      counts: analysis.counts,
      needs: analysis.needs,
    }
  })
}
