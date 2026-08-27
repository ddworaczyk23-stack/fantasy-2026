import type { LeagueSettings, Player, Position } from '../types'

// ============================================================================
// Deriving an OVERALL board from positional rankings only.
//
// A printed cheat sheet gives you "RB1 ... RB100, WR1 ... WR100" and nothing
// else. The engine needs a single overall ordering, and simply concatenating
// the positions would put every quarterback ahead of every running back.
//
// So we do what the draft-analytics world has done since Joe Bryant's original
// Value Based Drafting: turn each positional rank into an estimated point
// total, subtract the points you could get "for free" at that position (the
// replacement level for your league size and lineup), and rank everyone by
// what is left. That surplus - value over replacement - IS the overall board.
//
// Two properties fall out of this for free, and both match how this app is
// supposed to draft:
//   - Quarterbacks slide in a 1-QB league. QB12 and QB2 both start for someone,
//     so the surplus at QB is small even though the raw points are large.
//   - Kickers and defenses land at the very bottom, near zero surplus.
//
// Everything here is an ESTIMATE derived from rank, not a projection from
// real data. It is labelled as such wherever it reaches the user.
// ============================================================================

/**
 * Points-by-positional-rank curves for full PPR, one season.
 * `pts(rank) = base - slope * (rank - 1) ^ exp`, floored so deep bench players
 * never go negative. The shapes encode the well-known facts that TE falls off a
 * cliff early, RB decays faster than WR, and K/DST are nearly flat.
 */
interface Curve {
  base: number
  slope: number
  exp: number
  floor: number
}

const PPR_CURVES: Record<Position, Curve> = {
  QB: { base: 385, slope: 9.5, exp: 0.8, floor: 120 },
  RB: { base: 320, slope: 16, exp: 0.65, floor: 20 },
  WR: { base: 305, slope: 13, exp: 0.66, floor: 20 },
  TE: { base: 250, slope: 20, exp: 0.62, floor: 15 },
  DST: { base: 140, slope: 2.6, exp: 0.7, floor: 60 },
  K: { base: 145, slope: 2.0, exp: 0.7, floor: 70 },
}

/** Reception value shifts the pass-catching positions between formats. */
const RECEPTION_ADJUST: Record<Position, number> = {
  QB: 0,
  RB: 45, // a full-PPR back catches ~45 balls
  WR: 75,
  TE: 60,
  DST: 0,
  K: 0,
}

export function projectedPoints(
  position: Position,
  posRank: number,
  scoring: LeagueSettings['scoring'] = 'ppr',
): number {
  const c = PPR_CURVES[position]
  if (!c) return 0
  const r = Math.max(1, posRank)
  const raw = c.base - c.slope * Math.pow(r - 1, c.exp)
  // curves are calibrated for full PPR; strip reception value for other formats
  const recFactor = scoring === 'ppr' ? 0 : scoring === 'half' ? 0.5 : 1
  const adjusted = raw - RECEPTION_ADJUST[position] * recFactor
  return Math.max(c.floor, Math.round(adjusted * 10) / 10)
}

/**
 * The positional rank at which a player stops being a starter and becomes
 * something you could pick off waivers. Driven by the actual lineup: starters
 * per team times team count, plus the share of FLEX spots that position wins.
 */
export function replacementRank(position: Position, settings: LeagueSettings): number {
  const { teams, roster, superflex } = settings
  const flex = roster.FLEX * teams
  // FLEX spots split roughly 45% RB, 45% WR, 10% TE in full PPR
  const flexShare: Partial<Record<Position, number>> = {
    RB: flex * 0.45,
    WR: flex * 0.45,
    TE: flex * 0.1,
  }
  const starters: Record<Position, number> = {
    QB: roster.QB * teams + (superflex ? teams : 0),
    RB: roster.RB * teams,
    WR: roster.WR * teams,
    TE: roster.TE * teams,
    DST: roster.DST * teams,
    K: roster.K * teams,
  }
  // one past the last starter is the first freely available player
  return Math.max(1, Math.round(starters[position] + (flexShare[position] ?? 0))) + 1
}

export interface DerivedValue {
  position: Position
  posRank: number
  projPoints: number
  /** points above the replacement-level player at the same position */
  vorp: number
}

/**
 * Kickers and defenses are demoted below every skill player on the board.
 *
 * Straight VBD does not do this: K1 carries a small POSITIVE surplus over K13,
 * while RB60 carries a large negative one, so the raw math floats kickers into
 * the middle rounds ahead of real bench players. That is arithmetically true
 * and practically wrong - both positions are streamable off waivers all season,
 * and this app's own rule is never to draft them before the final two rounds.
 * The demotion makes the board agree with the strategy.
 */
const STREAMING_DEMOTION = 1000

export function deriveValue(
  position: Position,
  posRank: number,
  settings: LeagueSettings,
): DerivedValue {
  const projPoints = projectedPoints(position, posRank, settings.scoring)
  const replacement = projectedPoints(position, replacementRank(position, settings), settings.scoring)
  const demotion = position === 'K' || position === 'DST' ? STREAMING_DEMOTION : 0
  return {
    position,
    posRank,
    projPoints,
    vorp: Math.round((projPoints - replacement - demotion) * 10) / 10,
  }
}

export interface TierOptions {
  /** roughly how many tiers to spread across the STARTER range */
  targetTiers?: number
  minTierSize?: number
  maxTierSize?: number
  /** positional rank where starters end; the band width is calibrated on this */
  starterCount?: number
}

/**
 * Break a position's players into tiers at the real drop-offs in value.
 *
 * Band width is calibrated on the STARTER range - the value between the best
 * player at the position and the last one who starts - and a new tier opens
 * once cumulative value has fallen a full band below the top of the current
 * tier. Calibrating on starters matters: these curves are steep at the top and
 * almost flat in the tail, so anything derived from the whole list (a median
 * gap, an average) is dominated by the tail and gives every early player its
 * own tier, which is useless.
 *
 * Min and max tier sizes stop the extremes: a one-man tier at the top, or a
 * forty-man tier at the bottom.
 */
export function assignTiers(values: number[], opts: TierOptions = {}): number[] {
  if (values.length === 0) return []
  const { targetTiers = 6, minTierSize = 2, maxTierSize = 10, starterCount } = opts

  const starterEnd = Math.min(values.length, Math.max(2, starterCount ?? values.length))
  let band = (values[0] - values[starterEnd - 1]) / targetTiers
  if (!Number.isFinite(band) || band <= 0) {
    band = (values[0] - values[values.length - 1]) / Math.max(1, targetTiers)
  }
  if (!Number.isFinite(band) || band <= 0) return values.map(() => 1)

  const tiers: number[] = [1]
  let tier = 1
  let tierTop = values[0]
  let sizeInTier = 1

  for (let i = 1; i < values.length; i++) {
    const fellABand = tierTop - values[i] > band
    if ((fellABand && sizeInTier >= minTierSize) || sizeInTier >= maxTierSize) {
      tier++
      tierTop = values[i]
      sizeInTier = 0
    }
    sizeInTier++
    tiers.push(tier)
  }
  return tiers
}

export interface PositionalEntry {
  name: string
  team: string
  position: Position
  posRank: number
}

export interface BuiltBoard {
  players: Player[]
  notes: string[]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Build a full `Player[]` board from positional rankings alone.
 *
 * Overall rank comes from value over replacement, so the ordering is a real
 * draft board rather than "all the QBs, then all the RBs".
 */
export function buildBoardFromPositional(
  entries: PositionalEntry[],
  settings: LeagueSettings,
): BuiltBoard {
  const notes: string[] = []

  const valued = entries.map((e) => ({ entry: e, value: deriveValue(e.position, e.posRank, settings) }))

  // tiers are computed per position, over that position's VORP curve
  const byPosition = new Map<Position, typeof valued>()
  for (const v of valued) {
    const arr = byPosition.get(v.entry.position)
    if (arr) arr.push(v)
    else byPosition.set(v.entry.position, [v])
  }
  const tierByKey = new Map<string, number>()
  for (const [pos, arr] of byPosition) {
    arr.sort((a, b) => a.entry.posRank - b.entry.posRank)
    const tiers = assignTiers(arr.map((a) => a.value.vorp), {
      starterCount: replacementRank(pos, settings),
    })
    arr.forEach((a, i) => tierByKey.set(`${pos}|${a.entry.posRank}`, tiers[i]))
  }

  // overall order = value over replacement, descending
  valued.sort((a, b) => b.value.vorp - a.value.vorp || a.entry.posRank - b.entry.posRank)

  const seen = new Set<string>()
  const players: Player[] = valued.map((v, i) => {
    const e = v.entry
    let id = `${slugify(e.name)}-${e.team.toLowerCase()}`
    let n = 2
    while (seen.has(id)) id = `${slugify(e.name)}-${e.team.toLowerCase()}-${n++}`
    seen.add(id)

    return {
      id,
      name: e.name,
      team: e.team,
      position: e.position,
      bye: 0,
      overallRank: i + 1,
      posRank: e.posRank,
      tier: tierByKey.get(`${e.position}|${e.posRank}`) ?? 1,
      // No ADP on a cheat sheet. Seeding ADP with the derived overall rank keeps
      // value-vs-ADP neutral rather than inventing a market that does not exist.
      adp: i + 1,
      projPoints: v.value.projPoints,
      upside: 50,
      floor: 50,
      risk: 30,
      notes: '',
      tags: [],
      rationale: `${e.position}${e.posRank} on the FantasyPros positional board. Overall value derived from points over replacement for this league's lineup.`,
      customRank: null,
    }
  })

  notes.push(
    'Overall rank is DERIVED from positional rank using value over replacement for your ' +
      'league size and lineup - FantasyPros does not publish an overall rank on this sheet.',
  )
  notes.push(
    'ADP is seeded from that derived rank, so "value vs ADP" reads neutral. Import a file ' +
      'with a real ADP column to switch that signal on.',
  )
  notes.push('Bye weeks are not on this sheet, so bye-conflict warnings stay off until you add them.')
  notes.push('Upside, floor and risk are neutral. Tag players target/fade in Rankings to steer the engine.')

  return { players, notes }
}

/**
 * Parse the printed cheat-sheet text format:
 *   #RB
 *   1. Jahmyr Gibbs, DET
 * Lines that are not `<rank>. <name>, <TEAM>` under a `#POS` heading are
 * ignored, so headers, blank lines and attribution text pass through harmlessly.
 */
export function parsePositionalCheatSheet(text: string): {
  entries: PositionalEntry[]
  errors: string[]
} {
  const entries: PositionalEntry[] = []
  const errors: string[] = []
  const valid: Position[] = ['QB', 'RB', 'WR', 'TE', 'DST', 'K']

  let current: Position | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('#')) {
      const head = line.slice(1).trim().toUpperCase()
      const pos = head === 'DEF' ? 'DST' : head
      current = valid.includes(pos as Position) ? (pos as Position) : null
      continue
    }

    const m = /^(\d+)\.\s*(.+)$/.exec(line)
    if (!m) continue
    if (!current) continue

    const posRank = Number(m[1])
    const rest = m[2].trim()
    const comma = rest.lastIndexOf(',')
    if (comma < 0) {
      errors.push(`Could not read a team from "${line}".`)
      continue
    }
    const name = rest.slice(0, comma).trim()
    const team = rest.slice(comma + 1).trim().toUpperCase()
    if (!name || !team) {
      errors.push(`Could not read "${line}".`)
      continue
    }
    entries.push({ name, team, position: current, posRank })
  }

  return { entries, errors }
}
