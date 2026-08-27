import { describe, it, expect } from 'vitest'
import type { DraftPick, EngineContext, LeagueSettings, Player, Position } from '../../types'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS } from '../defaults'
import { makeSampleTeams } from '../../data/sampleLeague'
import { recommend } from '../recommend'
import { getTierAlerts } from '../tiers'
import { analyzeRoster } from '../roster'
import { myPickNumbers } from '../picks'

/** Minimal synthetic board: plenty of every position, no hidden data quirks. */
function board(): Player[] {
  const out: Player[] = []
  let rank = 1
  const add = (position: Position, n: number, basePts: number) => {
    for (let i = 1; i <= n; i++) {
      out.push({
        id: `${position.toLowerCase()}-${i}`,
        name: `${position} Player ${i}`,
        team: 'FA',
        position,
        bye: 7,
        overallRank: rank,
        posRank: i,
        tier: Math.ceil(i / 6),
        adp: rank,
        projPoints: basePts - i * 2,
        upside: 50,
        floor: 50,
        risk: 30,
        notes: '',
        tags: [],
        rationale: `Synthetic ${position} number ${i}.`,
        customRank: null,
      })
      rank++
    }
  }
  add('RB', 70, 300)
  add('WR', 70, 300)
  add('QB', 40, 400)
  add('TE', 40, 250)
  add('DST', 14, 130)
  add('K', 14, 140)
  out.sort((a, b) => a.overallRank - b.overallRank)
  out.forEach((p, i) => (p.overallRank = i + 1))
  return out
}

const settings: LeagueSettings = { ...DEFAULT_SETTINGS }
const teams = makeSampleTeams(settings.teams, settings.mySlot)
const MY_TEAM = teams.find((t) => t.isMe)!.id

/**
 * Build a context where every team has drafted through `throughPick`, and MY
 * team specifically holds `myPositions` - so I can force the exact roster
 * shape a rule is supposed to react to.
 */
function ctxWithMyRoster(currentPick: number, myPositions: Position[]): EngineContext {
  const players = board()
  const picks: DraftPick[] = []
  const used = new Set<string>()
  const mine = new Set(myPickNumbers(settings))

  const myQueue = [...myPositions]
  let filler = 0
  for (let p = 1; p < currentPick; p++) {
    let chosen: Player | undefined
    if (mine.has(p) && myQueue.length > 0) {
      const want = myQueue.shift()!
      chosen = players.find((x) => x.position === want && !used.has(x.id))
    }
    if (!chosen) {
      // Fill the rest of the room with anything that is not DST/K, so both
      // kickers and defenses are guaranteed to still be on the board at the end.
      chosen = players.find(
        (x) => !used.has(x.id) && x.position !== 'DST' && x.position !== 'K',
      )
      filler++
    }
    // The board must be deep enough to seat every pick before `currentPick`.
    expect(chosen, `ran out of non-DST/K players at pick ${p}`).toBeDefined()
    if (!chosen) break
    used.add(chosen.id)
    // Everything that is not one of MY picks is parked on a single opponent so
    // filler can never contaminate my roster shape.
    const other = teams.find((t) => !t.isMe)!
    picks.push({
      pickNumber: p,
      round: Math.ceil(p / settings.teams),
      slot: mine.has(p) ? settings.mySlot : other.slot,
      teamId: mine.has(p) ? MY_TEAM : other.id,
      playerId: chosen.id,
      timestamp: 0,
    })
  }
  expect(filler).toBeGreaterThan(0)
  return { players, picks, teams, settings, weights: DEFAULT_WEIGHTS, currentPick }
}

describe('endgame D/ST and K legality', () => {
  const filled: Position[] = ['RB', 'RB', 'WR', 'WR', 'TE', 'RB', 'QB', 'WR', 'RB', 'WR', 'WR', 'RB', 'TE']
  // Derived, never hardcoded - the league's pick numbers are user-editable.
  const MY_PICKS = myPickNumbers(settings)
  const LAST_PICK = MY_PICKS[MY_PICKS.length - 1]
  const SECOND_LAST = MY_PICKS[MY_PICKS.length - 2]
  const THIRD_LAST = MY_PICKS[MY_PICKS.length - 3]

  it('forces a DST or K at the second-to-last pick when both slots are empty', () => {
    // 2 picks left, DST and K both empty
    const ctx = ctxWithMyRoster(SECOND_LAST, filled)
    const roster = analyzeRoster(MY_TEAM, ctx)
    expect(roster.starters.filter((s) => s.player === null && (s.position === 'DST' || s.position === 'K')))
      .toHaveLength(2)

    const rec = recommend(ctx)
    expect(rec.onTheClock).toBe(true)
    expect(['DST', 'K']).toContain(rec.primary!.player.position)
  })

  it('forces the remaining mandatory slot at the very last pick', () => {
    const ctx = ctxWithMyRoster(LAST_PICK, [...filled, 'DST'])
    const rec = recommend(ctx)
    expect(rec.primary!.player.position).toBe('K')
  })

  it('does not force D/ST or K while there is still slack', () => {
    // 3 picks left, only 2 mandatory holes - a real player may win
    const ctx = ctxWithMyRoster(THIRD_LAST, filled.slice(0, 12))
    const rec = recommend(ctx)
    expect(['DST', 'K']).not.toContain(rec.primary!.player.position)
  })

  it('never surfaces D/ST or K before the window opens', () => {
    for (const p of MY_PICKS.slice(0, MY_PICKS.length - 3)) {
      const ctx = ctxWithMyRoster(p, filled)
      const rec = recommend(ctx)
      expect(['DST', 'K']).not.toContain(rec.primary!.player.position)
      for (const a of rec.alternatives) expect(['DST', 'K']).not.toContain(a.player.position)
    }
  })
})

describe('tier alert quality', () => {
  const filled: Position[] = ['RB', 'WR']
  const EARLY = myPickNumbers(settings).slice(0, 6)

  it('never uses QB, DST or K as the comparison position', () => {
    for (const p of EARLY) {
      const ctx = ctxWithMyRoster(p, filled)
      const roster = analyzeRoster(MY_TEAM, ctx)
      for (const a of getTierAlerts(ctx, roster)) {
        expect(a.message).not.toMatch(/comparable (QB|DST|K)s?\b/)
      }
    }
  })

  it('never tells a 1-QB drafter to prioritise QB in the early rounds', () => {
    for (const p of EARLY) {
      const ctx = ctxWithMyRoster(p, filled)
      const roster = analyzeRoster(MY_TEAM, ctx)
      for (const a of getTierAlerts(ctx, roster)) {
        expect(a.position).not.toBe('QB')
      }
    }
  })

  it('emits at most three alerts', () => {
    for (const p of EARLY) {
      const ctx = ctxWithMyRoster(p, filled)
      const roster = analyzeRoster(MY_TEAM, ctx)
      expect(getTierAlerts(ctx, roster).length).toBeLessThanOrEqual(3)
    }
  })

  it('only frames a position as the priority when it is an actual need', () => {
    const ctx = ctxWithMyRoster(EARLY[3], filled)
    const roster = analyzeRoster(MY_TEAM, ctx)
    for (const a of getTierAlerts(ctx, roster)) {
      if (/should be the priority/.test(a.message)) {
        expect(roster.priorities.next1).toContain(a.position)
      }
    }
  })

  it('writes grammatical counts', () => {
    for (const p of EARLY) {
      const ctx = ctxWithMyRoster(p, filled)
      const roster = analyzeRoster(MY_TEAM, ctx)
      for (const a of getTierAlerts(ctx, roster)) {
        expect(a.message).not.toMatch(/\b1 [A-Z]+s\b/)
        expect(a.message).not.toMatch(/undefined|NaN/)
      }
    }
  })
})
