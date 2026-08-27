import { describe, it, expect } from 'vitest'
import { makeSamplePlayers } from '../data/samplePlayers'
import { makeSampleTeams, makeSampleDraft } from '../data/sampleLeague'
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS } from '../engine/defaults'
import { recommend } from '../engine'
import { myPickNumbers } from '../engine/picks'
import type { EngineContext } from '../types'

function ctxAt(throughPick: number): EngineContext {
  const players = makeSamplePlayers()
  const settings = DEFAULT_SETTINGS
  const teams = makeSampleTeams(settings.teams, settings.mySlot)
  const picks = makeSampleDraft(players, settings, throughPick)
  return { players, picks, teams, settings, weights: DEFAULT_WEIGHTS, currentPick: picks.length + 1 }
}

describe('live smoke test on the real sample board', () => {
  it('my pick numbers match the stated 1.08 / 2.08 / 3.09 board', () => {
    expect(myPickNumbers(DEFAULT_SETTINGS).slice(0, 4)).toEqual([8, 20, 33, 45])
  })

  it('produces a real recommendation at every one of my picks', () => {
    for (const p of myPickNumbers(DEFAULT_SETTINGS)) {
      const ctx = ctxAt(p - 1)
      const rec = recommend(ctx)
      expect(rec.onTheClock).toBe(true)
      expect(rec.primary).not.toBeNull()
      expect(rec.strategyExplanation.length).toBeGreaterThan(60)
      expect(rec.alternatives.length).toBeGreaterThan(2)
      // eslint-disable-next-line no-console
      console.log(
        `pick ${String(p).padStart(3)} (R${rec.round}) -> ${rec.primary!.player.name} ` +
          `${rec.primary!.player.position} score=${rec.primary!.score.toFixed(1)} ` +
          `| alts: ${rec.alternatives.map((a) => `${a.player.name}(${a.player.position})`).join(', ')}`,
      )
    }
  })

  it('never recommends DST or K before the final two rounds', () => {
    for (const p of myPickNumbers(DEFAULT_SETTINGS)) {
      const rec = recommend(ctxAt(p - 1))
      if (rec.round <= DEFAULT_SETTINGS.rounds - DEFAULT_SETTINGS.kdstLastRounds) {
        expect(['DST', 'K']).not.toContain(rec.primary!.player.position)
        for (const a of rec.alternatives) expect(['DST', 'K']).not.toContain(a.player.position)
      }
    }
  })

  it('does not recommend a QB in rounds 1-3', () => {
    for (const p of [8, 20, 33]) {
      const rec = recommend(ctxAt(p - 1))
      expect(rec.primary!.player.position).not.toBe('QB')
    }
  })

  it('builds 4+ combined RB/WR by the end of round 5 when following its own advice', () => {
    // greedily follow the engine at my picks, sample-sim everyone else
    const players = makeSamplePlayers()
    const settings = DEFAULT_SETTINGS
    const teams = makeSampleTeams(settings.teams, settings.mySlot)
    const mine = new Set(myPickNumbers(settings))
    let picks = makeSampleDraft(players, settings, 0)
    const taken: string[] = []
    for (let p = 1; p <= 60; p++) {
      if (mine.has(p)) {
        const rec = recommend({ players, picks, teams, settings, weights: DEFAULT_WEIGHTS, currentPick: p })
        const pl = rec.primary!.player
        taken.push(pl.position)
        picks = [
          ...picks,
          { pickNumber: p, round: Math.ceil(p / 12), slot: settings.mySlot, teamId: 'team-8', playerId: pl.id, timestamp: 0 },
        ]
      } else {
        const sim = makeSampleDraft(players, settings, p)
        const next = sim[p - 1]
        const already = new Set(picks.map((x) => x.playerId))
        if (next && !already.has(next.playerId)) picks = [...picks, next]
        else {
          const free = players.find((x) => !already.has(x.id))!
          picks = [...picks, { pickNumber: p, round: Math.ceil(p / 12), slot: 1, teamId: 'team-1', playerId: free.id, timestamp: 0 }]
        }
      }
    }
    const rbwr = taken.filter((t) => t === 'RB' || t === 'WR').length
    // eslint-disable-next-line no-console
    console.log('my first 5 picks by position:', taken.slice(0, 5).join(' '), '| RB+WR =', rbwr)
    expect(rbwr).toBeGreaterThanOrEqual(4)
  })

  it('gives a can-i-wait verdict with a real explanation', () => {
    const rec = recommend(ctxAt(7))
    expect(rec.waitAnalysis.length).toBeGreaterThan(0)
    for (const w of rec.waitAnalysis) {
      expect(w.explanation.length).toBeGreaterThan(20)
      expect(w.explanation).not.toMatch(/undefined|NaN|\[object/)
    }
    // eslint-disable-next-line no-console
    console.log('WAIT:', rec.waitAnalysis.map((w) => `${w.playerName}=${w.verdict}(${Math.round(w.survivalProbability * 100)}%)`).join(' | '))
    // eslint-disable-next-line no-console
    console.log('STRATEGY:', rec.strategyExplanation)
    // eslint-disable-next-line no-console
    console.log('TIER ALERTS:', rec.tierAlerts.map((t) => t.message).join(' || '))
    // eslint-disable-next-line no-console
    console.log('ROOM:', rec.roomRead.summary.join(' || '))
  })

  it('no panel text contains undefined/NaN anywhere in a mid-draft state', () => {
    for (const p of [8, 33, 69, 117, 165, 177]) {
      const rec = recommend(ctxAt(p - 1))
      const blob = JSON.stringify(rec)
      expect(blob).not.toMatch(/undefined|NaN|\[object Object\]/)
    }
  })

  it('survives a fully drafted board without throwing', () => {
    const ctx = ctxAt(180)
    expect(() => recommend(ctx)).not.toThrow()
  })
})
