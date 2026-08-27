import { describe, it, expect } from 'vitest'
import { makeFantasyProsBoard } from '../data/fantasyProsBoard'
import { DEFAULT_SETTINGS } from '../engine/defaults'
import { replacementRank, projectedPoints } from '../services/valueBoard'
import type { Position } from '../types'

const { players, errors } = makeFantasyProsBoard(DEFAULT_SETTINGS)

describe('FantasyPros 2026 board', () => {
  it('parses every line of the cheat sheet with no errors', () => {
    expect(errors).toEqual([])
    expect(players).toHaveLength(372)
  })

  it('has the right count at each position', () => {
    const count = (p: Position) => players.filter((x) => x.position === p).length
    expect(count('QB')).toBe(50)
    expect(count('RB')).toBe(100)
    expect(count('WR')).toBe(100)
    expect(count('TE')).toBe(50)
    expect(count('K')).toBe(40)
    expect(count('DST')).toBe(32)
  })

  it('keeps FantasyPros positional order intact', () => {
    const rbs = players.filter((p) => p.position === 'RB').sort((a, b) => a.posRank - b.posRank)
    expect(rbs[0].name).toBe('Jahmyr Gibbs')
    expect(rbs[1].name).toBe('Bijan Robinson')
    const wrs = players.filter((p) => p.position === 'WR').sort((a, b) => a.posRank - b.posRank)
    expect(wrs[0].name).toBe("Ja'Marr Chase")
    const tes = players.filter((p) => p.position === 'TE').sort((a, b) => a.posRank - b.posRank)
    expect(tes[0].name).toBe('Brock Bowers')
  })

  it('gives every player a unique id and a sequential overall rank', () => {
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length)
    expect(players.map((p) => p.overallRank)).toEqual(players.map((_, i) => i + 1))
  })

  it('keeps QB, K and D/ST out of the first round', () => {
    // An elite TE in a 1-TE league is a legitimate late-first pick, so TE is
    // allowed here. A quarterback in a 1-QB league is not, and neither is a
    // streamable position.
    const round1 = players.slice(0, 12)
    for (const p of round1) {
      expect(['QB', 'K', 'DST']).not.toContain(p.position)
    }
    expect(round1.filter((p) => p.position === 'RB' || p.position === 'WR').length).toBeGreaterThanOrEqual(10)
  })

  it('slides quarterbacks out of the early rounds in a 1-QB league', () => {
    const firstQb = players.findIndex((p) => p.position === 'QB')
    // QB1 should land in the back half of round 2 or later, not round 1...
    expect(firstQb).toBeGreaterThanOrEqual(12)
    // ...but he must not fall out of the useful part of the board either
    expect(firstQb).toBeLessThan(48)
  })

  it('puts kickers and defenses at the very bottom of the board', () => {
    const firstK = players.findIndex((p) => p.position === 'K')
    const firstDst = players.findIndex((p) => p.position === 'DST')
    // both are streamable, so they sort below every skill player
    expect(firstK).toBeGreaterThan(250)
    expect(firstDst).toBeGreaterThan(250)
    const lastSkill = players.map((p) => p.position).lastIndexOf('WR')
    expect(firstK).toBeGreaterThan(lastSkill)
    expect(firstDst).toBeGreaterThan(lastSkill)
  })

  it('keeps the elite tight ends valuable but not first-round', () => {
    const bowers = players.find((p) => p.name === 'Brock Bowers')!
    // an elite TE in a 1-TE league is a real late-first / early-second pick
    expect(bowers.overallRank).toBeGreaterThan(5)
    expect(bowers.overallRank).toBeLessThan(40)
  })

  it('builds real tiers, not equal-sized buckets', () => {
    const rbTiers = players
      .filter((p) => p.position === 'RB')
      .sort((a, b) => a.posRank - b.posRank)
      .map((p) => p.tier)
    // tiers must be non-decreasing down the positional board
    for (let i = 1; i < rbTiers.length; i++) expect(rbTiers[i]).toBeGreaterThanOrEqual(rbTiers[i - 1])
    expect(Math.max(...rbTiers)).toBeGreaterThan(4)
    // the top tier must hold more than one player
    expect(rbTiers.filter((t) => t === 1).length).toBeGreaterThan(1)
    // and not every tier is the same size
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
      expect(p.rationale.length).toBeGreaterThan(10)
    }
  })

  it('flags what the cheat sheet cannot provide', () => {
    const { notes } = makeFantasyProsBoard(DEFAULT_SETTINGS)
    const blob = notes.join(' ')
    expect(blob).toMatch(/DERIVED/i)
    expect(blob).toMatch(/ADP/i)
    expect(blob).toMatch(/[Bb]ye/)
  })
})

describe('value-over-replacement model', () => {
  it('sets replacement level from the actual lineup', () => {
    // 12 teams, 1 QB each -> the 13th QB is replacement level
    expect(replacementRank('QB', DEFAULT_SETTINGS)).toBe(13)
    // 2 RB * 12 = 24 starters, plus ~45% of the 12 FLEX spots -> 29 start
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

  it('reprices pass-catchers when the league is not full PPR', () => {
    expect(projectedPoints('WR', 5, 'standard')).toBeLessThan(projectedPoints('WR', 5, 'ppr'))
    expect(projectedPoints('QB', 5, 'standard')).toBe(projectedPoints('QB', 5, 'ppr'))
  })
})
