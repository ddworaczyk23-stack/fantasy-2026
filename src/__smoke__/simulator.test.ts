import { describe, it, expect } from 'vitest'
import { makeSamplePlayers } from '../data/samplePlayers'
import { makeSampleDraft } from '../data/sampleLeague'
import { DEFAULT_SETTINGS } from '../engine/defaults'

/**
 * Regression tests for the sample draft simulator.
 *
 * These exist because the simulator's seeded RNG was originally drawn only
 * once per pick straight off the seed, which correlated every draw and made
 * the top two players on the board literally unreachable. The demo looked
 * broken: the app kept recommending the same two elite players round after
 * round because the simulated room refused to take them.
 */
describe('sample draft simulator', () => {
  const players = makeSamplePlayers()
  const byId = new Map(players.map((p) => [p.id, p]))
  const rankOf = (playerId: string) => byId.get(playerId)!.overallRank

  it('drafts the very top of the board inside round 1', () => {
    const picks = makeSampleDraft(players, DEFAULT_SETTINGS, 12)
    const ranks = picks.map((p) => rankOf(p.playerId))
    expect(ranks).toContain(1)
    expect(ranks).toContain(2)
    expect(Math.max(...ranks)).toBeLessThanOrEqual(20)
  })

  it('takes a near-contiguous run off the top of the board', () => {
    const picks = makeSampleDraft(players, DEFAULT_SETTINGS, 36)
    const ranks = picks.map((p) => rankOf(p.playerId)).sort((a, b) => a - b)
    // no more than a handful of the top 36 ranks may be skipped
    const skipped = Array.from({ length: 36 }, (_, i) => i + 1).filter((r) => !ranks.includes(r))
    expect(skipped.length).toBeLessThanOrEqual(8)
  })

  it('never drafts the same player twice and fills a full 15-round draft', () => {
    const picks = makeSampleDraft(players, DEFAULT_SETTINGS, 180)
    expect(picks).toHaveLength(180)
    expect(new Set(picks.map((p) => p.playerId)).size).toBe(180)
  })

  it('keeps D/ST and K out of the board until the final two rounds', () => {
    const picks = makeSampleDraft(players, DEFAULT_SETTINGS, 180)
    const early = picks.filter((p) => p.round <= DEFAULT_SETTINGS.rounds - DEFAULT_SETTINGS.kdstLastRounds)
    for (const p of early) {
      expect(['DST', 'K']).not.toContain(byId.get(p.playerId)!.position)
    }
  })

  it('is deterministic across runs', () => {
    const a = makeSampleDraft(players, DEFAULT_SETTINGS, 96)
    const b = makeSampleDraft(makeSamplePlayers(), DEFAULT_SETTINGS, 96)
    expect(a.map((p) => p.playerId)).toEqual(b.map((p) => p.playerId))
  })

  it('leaves undrafted players on the board at the end', () => {
    const picks = makeSampleDraft(players, DEFAULT_SETTINGS, 180)
    expect(players.length - picks.length).toBeGreaterThan(10)
  })
})
