import { describe, expect, it } from 'vitest'
import type { LeagueSettings } from '../../types'
import { DEFAULT_ROSTER } from '../defaults'
import {
  currentPickNumber,
  inKDstWindow,
  indexInRound,
  interveningPicks,
  isMyPick,
  myPickAfter,
  myPickNumbers,
  nextMyPickFrom,
  picksUntilNext,
  roundForPick,
  slotForPick,
} from '../picks'

function makeSettings(overrides: Partial<LeagueSettings> = {}): LeagueSettings {
  return {
    teams: 12,
    scoring: 'ppr',
    superflex: false,
    rounds: 15,
    snake: true,
    thirdRoundReversal: false,
    mySlot: 8,
    roster: DEFAULT_ROSTER,
    myPickOverrides: null,
    pickOwners: null,
    kdstLastRounds: 2,
    allowEarlyKDst: false,
    ...overrides,
  }
}

describe('roundForPick / indexInRound', () => {
  it('computes round and index for a 12-team league', () => {
    expect(roundForPick(1, 12)).toBe(1)
    expect(roundForPick(12, 12)).toBe(1)
    expect(roundForPick(13, 12)).toBe(2)
    expect(roundForPick(24, 12)).toBe(2)
    expect(roundForPick(25, 12)).toBe(3)
    expect(indexInRound(1, 12)).toBe(1)
    expect(indexInRound(12, 12)).toBe(12)
    expect(indexInRound(13, 12)).toBe(1)
  })
})

describe('slotForPick snake math', () => {
  it('round 1 goes in slot order', () => {
    const settings = makeSettings()
    expect(slotForPick(1, settings)).toBe(1)
    expect(slotForPick(8, settings)).toBe(8)
    expect(slotForPick(12, settings)).toBe(12)
  })

  it('round 2 reverses', () => {
    const settings = makeSettings()
    expect(slotForPick(13, settings)).toBe(12)
    expect(slotForPick(24, settings)).toBe(1)
  })

  it('round 3 continues the snake without reversal by default', () => {
    const settings = makeSettings()
    // round 3 is odd -> not reversed -> slot order again
    expect(slotForPick(25, settings)).toBe(1)
    expect(slotForPick(36, settings)).toBe(12)
  })

  it('third-round reversal flips round 3 and beyond', () => {
    const settings = makeSettings({ thirdRoundReversal: true })
    // round 3 would normally be slot order (1..12); reversal flips it to 12..1
    expect(slotForPick(25, settings)).toBe(12)
    expect(slotForPick(36, settings)).toBe(1)
    // round 2 is unaffected by third round reversal
    expect(slotForPick(13, settings)).toBe(12)
  })
})

describe('myPickOverrides wins over slot math', () => {
  it('uses the override list verbatim, ignoring snake math', () => {
    const settings = makeSettings({ myPickOverrides: [8, 20, 33] })
    expect(myPickNumbers(settings)).toEqual([8, 20, 33])
    expect(isMyPick(33, settings)).toBe(true)
    // Without overrides, slot 8 would also own pick 17 (round 2 reversal slot 8 -> pick 17)
    expect(isMyPick(17, settings)).toBe(false)
  })
})

describe('picksUntilNext', () => {
  it('counts picks between now and my next selection when on the clock', () => {
    const settings = makeSettings({ myPickOverrides: [8, 20, 33] })
    expect(picksUntilNext({ currentPick: 8, settings } as any)).toBe(11) // picks 9..19
  })

  it('counts picks between now and my upcoming pick when not on the clock', () => {
    const settings = makeSettings({ myPickOverrides: [8, 20, 33] })
    expect(picksUntilNext({ currentPick: 15, settings } as any)).toBe(5) // picks 15..19
  })

  it('is 0 when there is no further pick for me', () => {
    const settings = makeSettings({ myPickOverrides: [8] })
    expect(picksUntilNext({ currentPick: 8, settings } as any)).toBe(0)
  })
})

describe('interveningPicks', () => {
  it('lists the picks that can steal my target', () => {
    const settings = makeSettings({ myPickOverrides: [8, 20] })
    expect(interveningPicks({ currentPick: 8, settings } as any)).toEqual(
      Array.from({ length: 11 }, (_, i) => i + 9),
    )
  })
})

describe('currentPickNumber / myPickAfter / nextMyPickFrom', () => {
  it('derives the on-the-clock pick from the pick list length', () => {
    expect(currentPickNumber([])).toBe(1)
    expect(currentPickNumber([{} as any, {} as any])).toBe(3)
  })

  it('finds my next/after picks', () => {
    const settings = makeSettings({ myPickOverrides: [8, 20, 33] })
    expect(myPickAfter(8, settings)).toBe(20)
    expect(nextMyPickFrom(9, settings)).toBe(20)
  })
})

describe('inKDstWindow', () => {
  it('is false outside the final kdstLastRounds rounds', () => {
    const settings = makeSettings({ rounds: 15, kdstLastRounds: 2 })
    // round for pick 100 in a 12-team league
    const round = roundForPick(100, 12)
    expect(round).toBeLessThanOrEqual(13)
    expect(inKDstWindow({ currentPick: 100, settings } as any)).toBe(false)
  })

  it('is true inside the final kdstLastRounds rounds', () => {
    const settings = makeSettings({ rounds: 15, kdstLastRounds: 2, teams: 12 })
    // round 14 starts at pick 157
    expect(inKDstWindow({ currentPick: 157, settings } as any)).toBe(true)
  })
})
