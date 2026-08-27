import { describe, it, expect } from 'vitest'
import { makeFantasyProsPlayers } from '../data/fantasyProsBoard'
import { makeSampleTeams, makeSampleDraft } from '../data/sampleLeague'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS } from '../engine/defaults'
import { recommend } from '../engine'
import { myPickNumbers } from '../engine/picks'
import type { EngineContext } from '../types'

const settings = DEFAULT_SETTINGS
const players = makeFantasyProsPlayers(settings)
const teams = makeSampleTeams(settings.teams, settings.mySlot)

function ctxAt(through: number): EngineContext {
  const picks = makeSampleDraft(players, settings, through)
  return { players, picks, teams, settings, weights: DEFAULT_WEIGHTS, currentPick: picks.length + 1 }
}

describe('engine on the real FantasyPros board', () => {
  it('secures 4+ combined RB/WR through the first five rounds', () => {
    let picks = makeSampleDraft(players, settings, 0)
    const mine = new Set(myPickNumbers(settings))
    const taken: string[] = []
    for (let p = 1; p <= 60; p++) {
      if (mine.has(p)) {
        const rec = recommend({ players, picks, teams, settings, weights: DEFAULT_WEIGHTS, currentPick: p })
        const pl = rec.primary!.player
        taken.push(pl.position)
        picks = [...picks, { pickNumber: p, round: Math.ceil(p / 12), slot: settings.mySlot, teamId: 'team-8', playerId: pl.id, timestamp: 0 }]
      } else {
        const sim = makeSampleDraft(players, settings, p)
        const already = new Set(picks.map((x) => x.playerId))
        const next = sim[p - 1]
        if (next && !already.has(next.playerId)) picks = [...picks, next]
        else {
          const free = players.find((x) => !already.has(x.id))!
          picks = [...picks, { pickNumber: p, round: Math.ceil(p / 12), slot: 1, teamId: 'team-1', playerId: free.id, timestamp: 0 }]
        }
      }
    }
    const rbwr = taken.slice(0, 5).filter((t) => t === 'RB' || t === 'WR').length
    expect(rbwr).toBeGreaterThanOrEqual(4)
    expect(taken.slice(0, 5)).not.toContain('K')
    expect(taken.slice(0, 5)).not.toContain('DST')
  })

  it('recommends at every one of my picks', () => {
    for (const p of myPickNumbers(settings)) {
      const rec = recommend(ctxAt(p - 1))
      expect(rec.primary).not.toBeNull()
      expect(rec.strategyExplanation).toMatch(/Recommendation: Draft/)
      expect(rec.alternatives.length).toBeGreaterThan(2)
    }
  })
  it('never surfaces K or DST before the final two rounds', () => {
    for (const p of myPickNumbers(settings)) {
      const rec = recommend(ctxAt(p - 1))
      if (rec.round <= settings.rounds - settings.kdstLastRounds) {
        expect(['K', 'DST']).not.toContain(rec.primary!.player.position)
      }
    }
  })
  it('produces no undefined or NaN anywhere', () => {
    for (const p of myPickNumbers(settings)) {
      expect(JSON.stringify(recommend(ctxAt(p - 1)))).not.toMatch(/undefined|NaN/)
    }
  })
})
