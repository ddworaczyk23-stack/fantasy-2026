// ============================================================================
// Sample league + sample draft simulation for the offline demo.
// Deterministic (seeded LCG, no Math.random) so a given throughPick always
// reproduces the exact same draft.
// ============================================================================

import type { DraftPick, LeagueSettings, LeagueTeam, Player, Position } from '../types'
import { roundForPick, slotForPick } from '../engine/picks'

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

const FUN_TEAM_NAMES = [
  'Gridiron Goblins',
  'Blitz Brigade',
  'End Zone Ellers',
  'Waiver Wire Wizards',
  'Hail Mary Herd',
  'Turf Titans',
  'Red Zone Raiders',
  'Sunday Scorchers',
  'Fumble Farmers',
  'Draft Day Desperados',
  'Bye Week Bandits',
  'Pocket Passers',
  'Chain Gang Champs',
  'Flea Flicker Fanatics',
  'Gridlock Gators',
  'Two-Minute Warnings',
  'Onside Kickers',
  'Blocked Punt Bunch',
  'Audible Avengers',
  'Snap Count Squad',
]

/**
 * Build a full slate of league teams. `mySlot` gets the friendly "My Team"
 * name; every other slot gets a fun, neutral manager-style name.
 */
export function makeSampleTeams(teams: number, mySlot: number): LeagueTeam[] {
  const out: LeagueTeam[] = []
  let nameIdx = 0
  for (let slot = 1; slot <= teams; slot++) {
    const isMe = slot === mySlot
    out.push({
      id: `team-${slot}`,
      name: isMe ? 'My Team' : FUN_TEAM_NAMES[nameIdx++ % FUN_TEAM_NAMES.length],
      slot,
      isMe,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Draft simulation
// ---------------------------------------------------------------------------

/**
 * Simple deterministic LCG, seeded per-pick so the sim is reproducible.
 *
 * The seed is avalanche-mixed and the first few outputs are discarded on
 * purpose. A raw LCG's first output is strongly correlated with its seed, and
 * because this sim seeds from `pickNumber` and draws exactly once per pick,
 * that correlation collapsed the whole draft into a narrow band of the
 * distribution - the top two players on the board were literally unreachable.
 */
function makeRng(seed: number) {
  // xorshift-style avalanche so neighbouring seeds diverge immediately
  let s = seed >>> 0
  s ^= s >>> 16
  s = Math.imul(s, 0x21f0aaad) >>> 0
  s ^= s >>> 15
  s = Math.imul(s, 0x735a2d97) >>> 0
  s ^= s >>> 15

  const next = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    return s / 0x100000000
  }
  // burn the correlated head of the stream
  next()
  next()
  next()
  return next
}

/**
 * How many players deep the simulated room is willing to look.
 * Narrow at the top of the draft (the room agrees about the elites) and
 * widening as the board gets noisier.
 */
function poolSizeForRound(round: number): number {
  return Math.min(12, Math.max(3, Math.round(1 + round * 1.2)))
}

const ROSTER_CAP: Partial<Record<Position, number>> = { QB: 2, TE: 3 }

/** RB/WR get picked more often than a pure best-available sim would produce. */
const POSITION_WEIGHT: Record<Position, number> = {
  RB: 2.2,
  WR: 2.2,
  QB: 1,
  TE: 1.1,
  DST: 1,
  K: 1,
}

function weightedChoice(pool: Player[], rng: () => number): number {
  const weights = pool.map((p) => POSITION_WEIGHT[p.position] ?? 1)
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = rng() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return i
  }
  return pool.length - 1
}

/**
 * Simulate a plausible (not strictly best-available) draft through
 * `throughPick`. Deterministic: same inputs always produce the same picks.
 */
export function makeSampleDraft(
  players: Player[],
  settings: LeagueSettings,
  throughPick: number,
): DraftPick[] {
  const totalPicks = settings.teams * settings.rounds
  const cap = Math.max(0, Math.min(throughPick, totalPicks))
  const picks: DraftPick[] = []
  if (cap <= 0 || settings.teams <= 0) return picks

  const byRank = [...players].sort((a, b) => a.overallRank - b.overallRank)
  const drafted = new Set<string>()

  const rosterCounts = new Map<string, Partial<Record<Position, number>>>()
  for (let slot = 1; slot <= settings.teams; slot++) {
    rosterCounts.set(`team-${slot}`, {})
  }

  for (let pickNumber = 1; pickNumber <= cap; pickNumber++) {
    const slot = slotForPick(pickNumber, settings)
    const round = roundForPick(pickNumber, settings.teams)
    const teamId = `team-${slot}`
    const counts = rosterCounts.get(teamId) ?? {}
    const kdstAllowed = round > settings.rounds - settings.kdstLastRounds

    const poolSize = poolSizeForRound(round)

    const buildPool = (respectCaps: boolean): Player[] => {
      const pool: Player[] = []
      for (const p of byRank) {
        if (drafted.has(p.id)) continue
        if ((p.position === 'DST' || p.position === 'K') && !kdstAllowed) continue
        if (respectCaps) {
          const capFor = ROSTER_CAP[p.position]
          if (capFor !== undefined && (counts[p.position] ?? 0) >= capFor) continue
        }
        pool.push(p)
        if (pool.length >= poolSize) break
      }
      return pool
    }

    // Primary pool: respects roster caps and the DST/K window.
    let pool = buildPool(true)
    // Fallback: drop the QB/TE caps if nothing qualifies (still respect the
    // DST/K window so we don't draft kickers in round 2).
    if (pool.length === 0) pool = buildPool(false)
    // Last resort: drop the DST/K window too, so we never draft the same
    // player twice but also never crash when the board is nearly empty.
    if (pool.length === 0) {
      for (const p of byRank) {
        if (drafted.has(p.id)) continue
        pool.push(p)
        if (pool.length >= poolSize) break
      }
    }
    if (pool.length === 0) break // board fully exhausted

    const rng = makeRng(pickNumber * 2654435761)
    const chosen = pool[weightedChoice(pool, rng)]

    drafted.add(chosen.id)
    counts[chosen.position] = (counts[chosen.position] ?? 0) + 1
    rosterCounts.set(teamId, counts)

    picks.push({
      pickNumber,
      round,
      slot,
      teamId,
      playerId: chosen.id,
      timestamp: 0,
    })
  }

  return picks
}

// ---------------------------------------------------------------------------
// Draft day checklist
// ---------------------------------------------------------------------------

export const DRAFT_DAY_CHECKLIST: { text: string; detail: string }[] = [
  {
    text: 'Refresh rankings and injury news the morning of the draft',
    detail:
      'Beat writer reports and practice-participation news move fast in the final 24 hours; stale ranks cost real value.',
  },
  {
    text: 'Verify scoring format and roster requirements match your league',
    detail:
      'Full PPR vs half-PPR and FLEX/superflex settings change entire tiers of players; confirm before you sit down.',
  },
  {
    text: 'Upload your customized rankings CSV before the clock starts',
    detail:
      'If you have your own board, import it early so custom ranks and tiers are live for every pick, not added mid-draft.',
  },
  {
    text: 'Confirm your draft order and exact pick numbers',
    detail:
      'Know every pick number you own, not just your slot, especially if the league uses a non-standard or overridden order.',
  },
  {
    text: 'Do not chase a QB, TE, DST, or K run',
    detail:
      'Positional runs create panic reaches; the position rarely dries up as fast as the room makes it feel.',
  },
  {
    text: 'Lean on tiers and next-pick survival odds over gut feel',
    detail:
      'A player at the bottom of a tier is a different decision than one at the top of the next tier down, even at similar ADP.',
  },
  {
    text: 'Leave D/ST and K for the final two rounds',
    detail:
      'Weekly streaming options exist all season; locking one in early only costs you a roster spot with real upside.',
  },
]
