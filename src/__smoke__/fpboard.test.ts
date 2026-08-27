import { describe, it, expect } from 'vitest'
import { makeFantasyProsBoard } from '../data/fantasyProsBoard'
import { DEFAULT_SETTINGS } from '../engine/defaults'
import { parseAllRankingsCsv } from '../services/fantasyProsAllRankings'
import { replacementRank, projectedPoints } from '../services/valueBoard'
import type { Position } from '../types'
import rawAllRankings from '../data/raw/fantasypros-2026-all-rankings.csv?raw'

const { players, errors } = makeFantasyProsBoard(DEFAULT_SETTINGS)

describe('FantasyPros 2026 ALL Rankings board', () => {
  it('parses the CSV with no errors and 521 real players', () => {
    expect(errors).toEqual([])
    expect(players).toHaveLength(521)
  })

  it('skips the blank tier-boundary marker rows', () => {
    const { rows, errors: parseErrors } = parseAllRankingsCsv(rawAllRankings)
    expect(parseErrors).toEqual([])
    expect(rows).toHaveLength(521)
    expect(rows.every((r) => r.name.trim().length > 0)).toBe(true)
  })

  it('keeps the real overall order from the file', () => {
    expect(players[0].name).toBe("Ja'Marr Chase")
    expect(players[1].name).toBe('Jahmyr Gibbs')
    expect(players[2].name).toBe('Puka Nacua')
    expect(players.map((p) => p.overallRank)).toEqual(players.map((_, i) => i + 1))
  })

  it('recovers real ADP from the ECR-vs-ADP delta', () => {
    const cmc = players.find((p) => p.name === 'Christian McCaffrey')!
    // RK 9, delta -4 -> ADP 5: the market takes him earlier than his rank
    expect(cmc.overallRank).toBe(9)
    expect(cmc.adp).toBe(5)
  })

  it('carries real bye weeks', () => {
    const chase = players.find((p) => p.name === "Ja'Marr Chase")!
    expect(chase.bye).toBe(6)
    const gibbs = players.find((p) => p.name === 'Jahmyr Gibbs')!
    expect(gibbs.bye).toBe(6)
  })

  it('keeps QB, K and D/ST out of the first round', () => {
    const round1 = players.slice(0, 12)
    for (const p of round1) {
      expect(['QB', 'K', 'DST']).not.toContain(p.position)
    }
    expect(round1.filter((p) => p.position === 'RB' || p.position === 'WR').length).toBeGreaterThanOrEqual(9)
  })

  it('slides QB1 out of the first round in a 1-QB league, per the real file', () => {
    const firstQb = players.findIndex((p) => p.position === 'QB')
    expect(players[firstQb].name).toBe('Josh Allen')
    expect(firstQb).toBeGreaterThanOrEqual(12)
    expect(firstQb).toBeLessThan(40)
  })

  it('keeps kickers and defenses out of the startable early-to-mid rounds, per the real file', () => {
    // Real market data: kickers and defenses go in the double-digit rounds,
    // even though deep waiver-wire WRs exist even later than that.
    const firstK = players.findIndex((p) => p.position === 'K')
    const firstDst = players.findIndex((p) => p.position === 'DST')
    expect(firstK).toBeGreaterThan(150)
    expect(firstDst).toBeGreaterThan(150)
  })

  it('gives every player a unique id', () => {
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length)
  })

  it('builds real per-position tiers, not one-man tiers', () => {
    const rbTiers = players
      .filter((p) => p.position === 'RB')
      .sort((a, b) => a.posRank - b.posRank)
      .map((p) => p.tier)
    for (let i = 1; i < rbTiers.length; i++) expect(rbTiers[i]).toBeGreaterThanOrEqual(rbTiers[i - 1])
    expect(rbTiers.filter((t) => t === 1).length).toBeGreaterThan(1)
    const sizes = new Map<number, number>()
    for (const t of rbTiers) sizes.set(t, (sizes.get(t) ?? 0) + 1)
    expect(new Set(sizes.values()).size).toBeGreaterThan(1)
  })

  it('produces finite, usable numbers for the engine', () => {
    for (const p of players) {
      expect(Number.isFinite(p.projPoints)).toBe(true)
      expect(p.projPoints).toBeGreaterThan(0)
      expect(Number.isFinite(p.adp)).toBe(true)
      expect(Number.isFinite(p.tier)).toBe(true)
      expect(Number.isFinite(p.upside)).toBe(true)
      expect(Number.isFinite(p.risk)).toBe(true)
      expect(p.rationale.length).toBeGreaterThan(10)
    }
  })

  it('reads upside/bust star ratings into upside and risk', () => {
    const chase = players.find((p) => p.name === "Ja'Marr Chase")! // 5/5 upside, 1/5 bust
    expect(chase.upside).toBe(100)
    expect(chase.risk).toBe(20)
    expect(chase.floor).toBe(80)
  })

  it('tags a big faller as value and a big reach as avoid-at-cost', () => {
    // Sam Darnold: RK 137, delta +48 -> ADP 185, a real faller
    const darnold = players.find((p) => p.name === 'Sam Darnold')!
    expect(darnold.tags).toContain('value')
    // Derrick Henry: RK 37, delta -21 -> ADP 16, drafted well ahead of rank
    const henry = players.find((p) => p.name === 'Derrick Henry')!
    expect(henry.tags).toContain('avoid-at-cost')
  })

  it('flags what is derived versus what is real, in the notes', () => {
    const { notes } = makeFantasyProsBoard(DEFAULT_SETTINGS)
    const blob = notes.join(' ')
    expect(blob).toMatch(/floor/i)
    expect(blob).toMatch(/tag/i)
  })
})

describe('value-over-replacement model (still used for tiering only)', () => {
  it('sets replacement level from the actual lineup', () => {
    expect(replacementRank('QB', DEFAULT_SETTINGS)).toBe(13)
    expect(replacementRank('RB', DEFAULT_SETTINGS)).toBe(30)
    expect(replacementRank('WR', DEFAULT_SETTINGS)).toBe(30)
  })

  it('adds a QB starter per team in superflex', () => {
    const sf = { ...DEFAULT_SETTINGS, superflex: true }
    expect(replacementRank('QB', sf)).toBe(25)
  })

  it('declines within every position', () => {
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as Position[]) {
      expect(projectedPoints(pos, 1)).toBeGreaterThan(projectedPoints(pos, 10))
      expect(projectedPoints(pos, 10)).toBeGreaterThanOrEqual(projectedPoints(pos, 30))
    }
  })
})
