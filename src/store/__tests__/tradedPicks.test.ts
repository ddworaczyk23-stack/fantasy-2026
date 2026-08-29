import { describe, expect, it } from 'vitest'
import { myPickNumbers, ownerSlotForPick, teamForPick } from '../../engine/picks'
import { pickOwnersFromTrades } from '../../services/sleeperSync'
import type { SleeperTradedPick } from '../../services/sleeperAdapter'
import type { LeagueSettings, LeagueTeam } from '../../types'

const SHAPE = { teams: 12, rounds: 15, snake: true, thirdRoundReversal: false }

// roster id N sits in draft slot N, which is the simple case worth pinning.
const SLOT_TO_ROSTER: Record<number, string> = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [i + 1, String(i + 1)]),
)

function settings(pickOwners: Record<number, number> | null): LeagueSettings {
  return {
    ...SHAPE,
    scoring: 'ppr',
    superflex: false,
    mySlot: 8,
    roster: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 6 },
    myPickOverrides: null,
    pickOwners,
    kdstLastRounds: 2,
    allowEarlyKDst: false,
  }
}

const traded = (round: number, from: string, to: string, season = '2026'): SleeperTradedPick => ({
  season,
  round,
  originalRosterId: from,
  ownerRosterId: to,
})

describe('pickOwnersFromTrades', () => {
  it('maps a round-1 trade onto the right overall pick number', () => {
    const owners = pickOwnersFromTrades([traded(1, '8', '3')], SLOT_TO_ROSTER, '2026', SHAPE)
    expect(owners).toEqual({ 8: 3 })
  })

  it('follows the snake back for a round-2 trade', () => {
    // Round 2 runs 12..1, so slot 5 makes overall pick 20.
    const owners = pickOwnersFromTrades([traded(2, '5', '8')], SLOT_TO_ROSTER, '2026', SHAPE)
    expect(owners).toEqual({ 20: 8 })
  })

  it('ignores other seasons, out-of-range rounds, and no-op trades', () => {
    const owners = pickOwnersFromTrades(
      [traded(1, '8', '3', '2027'), traded(99, '8', '3'), traded(2, '4', '4')],
      SLOT_TO_ROSTER,
      '2026',
      SHAPE,
    )
    expect(owners).toBeNull()
  })

  it('returns null when the draft has no slot-to-roster map', () => {
    expect(pickOwnersFromTrades([traded(1, '8', '3')], null, '2026', SHAPE)).toBeNull()
  })
})

describe('traded picks change who owns a pick', () => {
  const s = settings({ 8: 3, 20: 8 })

  it('gives a traded pick to its new owner', () => {
    expect(ownerSlotForPick(8, s)).toBe(3)
    expect(ownerSlotForPick(20, s)).toBe(8)
    expect(ownerSlotForPick(17, s)).toBe(8) // untouched pick still uses snake math
  })

  it('drops the pick I traded away and adds the one I bought', () => {
    const mine = myPickNumbers(s)
    expect(mine).not.toContain(8)
    expect(mine).toContain(20)
    expect(mine).toContain(17)
  })

  it('labels the clock with the new owner', () => {
    const teams: LeagueTeam[] = Array.from({ length: 12 }, (_, i) => ({
      id: `team-${i + 1}`,
      name: `Team ${i + 1}`,
      slot: i + 1,
      isMe: i + 1 === 8,
    }))
    expect(teamForPick(8, teams, s)?.slot).toBe(3)
  })
})
