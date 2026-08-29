import { ownerSlotForPick, slotForPick } from '../engine/picks'
import type { DraftPick, LeagueSettings, LeagueTeam, Player, RosterSlots } from '../types'
import type {
  SleeperDraftInfo,
  SleeperDraftPick,
  SleeperLeagueInfo,
  SleeperTradedPick,
} from './sleeperAdapter'

// ============================================================================
// Pure mapping between Sleeper's world and this app's board.
// No network, no React, no storage - so all of it is unit tested.
// ============================================================================

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/**
 * Reduce a player name to a comparable key: lowercase, no punctuation, no
 * generational suffix. "Ja'Marr Chase" and "JaMarr Chase" collapse together,
 * and "Brian Robinson Jr." matches "Brian Robinson".
 */
export function normalizeName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[.'`’]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((part) => part.length > 0 && !SUFFIXES.has(part))
    .join(' ')
    .trim()
}

/**
 * A printed cheat sheet abbreviates first names to save space - "P. Mahomes II",
 * "A. St. Brown", "J. Smith-Njigba" - while Sleeper always sends the full name.
 * This key collapses both sides to "first initial + last name" so they meet.
 */
export function initialKey(name: string): string {
  const parts = normalizeName(name).split(' ').filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts[0][0]}|${parts[parts.length - 1]}`
}

export interface MatchResult {
  player: Player | null
  /** how the match was made, for auditing a wrong pick later */
  how: 'exact' | 'name-position' | 'name-only' | 'initial-team' | 'team-defense' | 'none'
}

/**
 * Find the board player a Sleeper pick refers to.
 *
 * Sleeper draft picks carry first_name/last_name/position/team in metadata,
 * so no 5MB player-id file is needed. Matching is deliberately strict-first
 * and only loosens one step at a time, and it never guesses across positions.
 */
export function matchPlayer(pick: SleeperDraftPick, players: Player[]): MatchResult {
  const pos = pick.position
  const team = (pick.team ?? '').toUpperCase()

  // Defenses: Sleeper's "team" IS the identity. Names differ (Broncos vs Denver
  // Broncos vs DEN), so never match a defense by name.
  if (pos === 'DST') {
    const byTeam = players.find((p) => p.position === 'DST' && p.team.toUpperCase() === team)
    return byTeam ? { player: byTeam, how: 'team-defense' } : { player: null, how: 'none' }
  }

  const key = normalizeName(pick.playerName)
  if (!key) return { player: null, how: 'none' }

  const exact = players.find(
    (p) => normalizeName(p.name) === key && p.position === pos && p.team.toUpperCase() === team,
  )
  if (exact) return { player: exact, how: 'exact' }

  // Same name and position but a different team - a real player who was traded
  // or whose team field is stale on one side. Still a confident match.
  const namePos = players.filter((p) => normalizeName(p.name) === key && p.position === pos)
  if (namePos.length === 1) return { player: namePos[0], how: 'name-position' }

  // Name alone, only when it is unambiguous on the whole board.
  const nameOnly = players.filter((p) => normalizeName(p.name) === key)
  if (nameOnly.length === 1) return { player: nameOnly[0], how: 'name-only' }

  // Abbreviated first name on one side ("P. Mahomes II" vs "Patrick Mahomes").
  // Position AND team must both agree here, and the result must be unique -
  // first initial plus surname is not specific enough on its own.
  const ik = initialKey(pick.playerName)
  if (ik.includes('|')) {
    const byInitial = players.filter(
      (p) => p.position === pos && p.team.toUpperCase() === team && initialKey(p.name) === ik,
    )
    if (byInitial.length === 1) return { player: byInitial[0], how: 'initial-team' }
  }

  return { player: null, how: 'none' }
}

export interface UnmatchedPick {
  pickNumber: number
  playerName: string
  position: string
  team: string
}

export interface ReconcileResult {
  picks: DraftPick[]
  unmatched: UnmatchedPick[]
  /** picks Sleeper reports that we successfully placed on the board */
  matched: number
  /** picks Sleeper reports in total */
  total: number
}

/**
 * Turn Sleeper's pick list into this app's `DraftPick[]`.
 *
 * Rules that matter mid-draft:
 *   - A Sleeper pick we cannot match is REPORTED, never silently dropped and
 *     never allowed to shift later picks onto the wrong player.
 *   - The same board player is never drafted twice, even if Sleeper's feed
 *     repeats or the board has a duplicate entry.
 *   - Team assignment comes from the draft slot, so it stays correct even when
 *     Sleeper's roster ids do not line up with local team ids.
 */
export function reconcilePicks(
  sleeperPicks: SleeperDraftPick[],
  players: Player[],
  teams: LeagueTeam[],
  settings: LeagueSettings,
): ReconcileResult {
  const picks: DraftPick[] = []
  const unmatched: UnmatchedPick[] = []
  const used = new Set<string>()

  for (const sp of [...sleeperPicks].sort((a, b) => a.pickNumber - b.pickNumber)) {
    const { player } = matchPlayer(sp, players)
    if (!player || used.has(player.id)) {
      unmatched.push({
        pickNumber: sp.pickNumber,
        playerName: sp.playerName,
        position: sp.position,
        team: sp.team,
      })
      continue
    }
    used.add(player.id)
    // `draft_slot` is the seat the pick sits in, NOT who owns it. When a pick
    // has been traded the two differ, so ownership decides the team - otherwise
    // a traded first lands on the wrong roster. Sleeper's own pick_no is used
    // for the lookup, before any local renumbering below.
    const ownerSlot = ownerSlotForPick(sp.pickNumber, settings)
    const team = teams.find((t) => t.slot === ownerSlot)
    picks.push({
      pickNumber: sp.pickNumber,
      round: sp.round,
      slot: ownerSlot,
      teamId: team?.id ?? `team-${ownerSlot}`,
      playerId: player.id,
      timestamp: 0,
    })
  }

  // Renumber so the board has no holes where an unmatched pick was skipped.
  // Sleeper's own pick_no is kept in order; only the local numbering is
  // compacted, because the engine derives "who is on the clock" from count.
  picks.sort((a, b) => a.pickNumber - b.pickNumber)
  picks.forEach((p, i) => {
    p.pickNumber = i + 1
    p.round = Math.floor(i / settings.teams) + 1
  })

  return { picks, unmatched, matched: picks.length, total: sleeperPicks.length }
}

/** Map Sleeper's roster_positions array onto this app's roster slot counts. */
export function rosterSlotsFromSleeper(rosterPositions: string[]): RosterSlots {
  const slots: RosterSlots = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, DST: 0, K: 0, BENCH: 0 }
  for (const raw of rosterPositions) {
    const p = (raw ?? '').toUpperCase().trim()
    switch (p) {
      case 'QB':
        slots.QB++
        break
      case 'RB':
        slots.RB++
        break
      case 'WR':
        slots.WR++
        break
      case 'TE':
        slots.TE++
        break
      case 'FLEX':
      case 'WRRB_FLEX':
      case 'REC_FLEX':
      case 'WRRB_WRT':
        slots.FLEX++
        break
      case 'DEF':
      case 'DST':
        slots.DST++
        break
      case 'K':
      case 'PK':
        slots.K++
        break
      case 'BN':
      case 'TAXI':
      case 'IR':
        slots.BENCH++
        break
      case 'SUPER_FLEX':
        // superflex is handled by the league setting, not a roster slot here
        slots.FLEX++
        break
      default:
        slots.BENCH++
        break
    }
  }
  return slots
}

/**
 * Turn Sleeper's traded-pick records into an "overall pick number -> owning
 * slot" map.
 *
 * Sleeper stores a traded pick as (season, round, original roster, new owner).
 * The ORIGINAL roster is what fixes the pick's place in the draft order, so we
 * resolve that roster to its draft slot, ask snake math which overall pick that
 * slot makes in that round, and record the new owner against it.
 *
 * Only picks that actually changed hands get an entry. Trades for another
 * season, or rounds past the end of this draft, are ignored.
 */
export function pickOwnersFromTrades(
  tradedPicks: SleeperTradedPick[],
  slotToRosterId: Record<number, string> | null,
  season: string,
  settings: Pick<LeagueSettings, 'teams' | 'rounds' | 'snake' | 'thirdRoundReversal'>,
): Record<number, number> | null {
  if (!slotToRosterId || tradedPicks.length === 0) return null

  const rosterToSlot = new Map<string, number>()
  for (const [slot, rosterId] of Object.entries(slotToRosterId)) rosterToSlot.set(rosterId, Number(slot))

  const owners: Record<number, number> = {}
  for (const t of tradedPicks) {
    if (season && t.season && t.season !== season) continue
    if (t.round < 1 || t.round > settings.rounds) continue
    const originalSlot = rosterToSlot.get(t.originalRosterId)
    const ownerSlot = rosterToSlot.get(t.ownerRosterId)
    if (!originalSlot || !ownerSlot || originalSlot === ownerSlot) continue

    const first = (t.round - 1) * settings.teams + 1
    for (let p = first; p < first + settings.teams; p++) {
      if (slotForPick(p, settings as LeagueSettings) === originalSlot) {
        owners[p] = ownerSlot
        break
      }
    }
  }
  return Object.keys(owners).length > 0 ? owners : null
}

export interface ImportedLeague {
  settings: Partial<LeagueSettings>
  teams: LeagueTeam[]
  notes: string[]
}

/**
 * Build local league settings and teams from a Sleeper league + draft.
 * `myUserId` positions the user in the draft order when Sleeper exposes it.
 */
export function importLeague(
  league: SleeperLeagueInfo,
  draft: SleeperDraftInfo | null,
  myUserId: string,
  existingTeams: LeagueTeam[],
  userNames: Record<string, string>,
  tradedPicks: SleeperTradedPick[] = [],
): ImportedLeague {
  const notes: string[] = []
  const teamCount = draft?.teams ?? league.teams ?? 12
  const rounds = draft?.rounds ?? 15
  const roster = rosterSlotsFromSleeper(league.rosterPositions)
  const superflex = league.rosterPositions.some((p) => (p ?? '').toUpperCase() === 'SUPER_FLEX')

  let mySlot = 0
  if (draft?.draftOrder && myUserId && draft.draftOrder[myUserId]) {
    mySlot = draft.draftOrder[myUserId]
    notes.push(`Your draft slot is ${mySlot}, read from the Sleeper draft order.`)
  } else {
    notes.push('Sleeper did not expose a draft order yet, so your draft slot was left as-is.')
  }

  const teams: LeagueTeam[] = []
  const slotToUser = new Map<number, string>()
  if (draft?.draftOrder) {
    for (const [userId, slot] of Object.entries(draft.draftOrder)) slotToUser.set(slot, userId)
  }
  for (let slot = 1; slot <= teamCount; slot++) {
    const userId = slotToUser.get(slot)
    const isMe = mySlot > 0 ? slot === mySlot : (existingTeams.find((t) => t.slot === slot)?.isMe ?? false)
    const sleeperName = userId ? userNames[userId] : undefined
    const previous = existingTeams.find((t) => t.slot === slot)
    teams.push({
      id: previous?.id ?? `team-${slot}`,
      name: isMe ? 'My Team' : (sleeperName ?? previous?.name ?? `Team ${slot}`),
      slot,
      isMe,
    })
  }

  if (draft && draft.type !== 'snake') {
    notes.push(`Sleeper reports a "${draft.type}" draft, so snake order was turned off.`)
  }
  if (draft?.reversalRound) {
    notes.push(`Third-round reversal detected (reversal round ${draft.reversalRound}).`)
  }

  const snake = draft ? draft.type === 'snake' : true
  const thirdRoundReversal = Boolean(draft?.reversalRound)
  const pickOwners = pickOwnersFromTrades(
    tradedPicks,
    draft?.slotToRosterId ?? null,
    league.season,
    { teams: teamCount, rounds, snake, thirdRoundReversal },
  )
  if (pickOwners) {
    notes.push(`${Object.keys(pickOwners).length} traded draft pick(s) applied to the board.`)
  } else if (tradedPicks.length > 0 && !draft?.slotToRosterId) {
    notes.push(
      'Sleeper reports traded draft picks, but the draft has no slot-to-roster map yet, ' +
        'so pick ownership still uses plain snake order.',
    )
  }

  const settings: Partial<LeagueSettings> = {
    teams: teamCount,
    rounds,
    scoring: league.scoring,
    superflex,
    roster,
    snake,
    thirdRoundReversal,
    // Sleeper knows the true order, so a hand-typed override no longer applies.
    myPickOverrides: null,
    pickOwners,
  }
  if (mySlot > 0) settings.mySlot = mySlot

  return { settings, teams, notes }
}
