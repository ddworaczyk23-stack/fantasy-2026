import type { Player, PlayerTag, Position } from '../types'
import { assignTiers, projectedPoints, replacementRank } from './valueBoard'
import type { LeagueSettings } from '../types'
import { splitFantasyProsPos } from './fantasyPros'

// ============================================================================
// Parser for FantasyPros' full "ALL Rankings" CSV export.
//
// Unlike the positional-only cheat sheet, this export carries REAL overall
// rank, REAL overall tiers, a bye week, and an "ECR vs. ADP" delta that lets
// us recover a real per-player ADP - so nothing here is estimated the way
// `valueBoard.ts` has to estimate for a positional-only sheet. Only two things
// are still derived: per-POSITION tiers (the file's tiers span every
// position at once) and a rough floor score (the file has no floor rating).
//
// Header (quoted, comma-separated):
//   RK, TIERS, PLAYER NAME, TEAM, POS, BYE WEEK, UPSIDE, BUST, SOS SEASON, ECR VS. ADP
//
// A handful of rows are tier-boundary markers with no player - just a blank
// RK and a tier number (`"",4`). Those are skipped.
// ============================================================================

export interface AllRankingsRow {
  rk: number
  name: string
  team: string
  position: Position
  posRank: number
  bye: number
  upside: number // 0-100, from "N out of 5"
  bust: number // 0-100, from "N out of 5"
  /** real ADP recovered from RK + the ECR-vs-ADP delta */
  adp: number
}

function starRatingToScore(cell: string): number {
  const m = /^(\d+)\s*out of\s*5/i.exec((cell ?? '').trim())
  if (!m) return 50 // "-" or missing -> neutral, never a fabricated extreme
  return Math.max(0, Math.min(100, Number(m[1]) * 20))
}

/** RFC-4180-ish single line splitter that respects quoted commas. Reuses the
 * same shape as csv.ts's parser so both files behave identically on quotes. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells
}

export function parseAllRankingsCsv(text: string): { rows: AllRankingsRow[]; errors: string[] } {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { rows: [], errors: ['File is empty.'] }

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const idx = (...names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  const iRk = idx('rk')
  const iName = idx('player name', 'player')
  const iTeam = idx('team')
  const iPos = idx('pos')
  const iBye = idx('bye week', 'bye')
  const iUpside = idx('upside')
  const iBust = idx('bust')
  const iDelta = idx('ecr vs. adp', 'ecr vs adp')

  if (iRk < 0 || iName < 0 || iPos < 0) {
    return { rows: [], errors: ['Missing RK, PLAYER NAME or POS column.'] }
  }

  const rows: AllRankingsRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const rk = Number((cells[iRk] ?? '').replace(/[^0-9.]/g, ''))
    const name = (cells[iName] ?? '').trim()
    if (!rk || !name) continue // tier-boundary marker row, or a blank line

    const { position, posRank } = splitFantasyProsPos(cells[iPos] ?? '')
    if (!position) {
      errors.push(`Row ${i + 1}: could not read a position from "${cells[iPos]}".`)
      continue
    }

    const delta = Number((cells[iDelta] ?? '').replace(/[^0-9.+-]/g, '')) || 0
    const bye = iBye >= 0 ? Number((cells[iBye] ?? '').replace(/[^0-9]/g, '')) || 0 : 0

    rows.push({
      rk,
      name,
      team: iTeam >= 0 ? (cells[iTeam] ?? '').trim().toUpperCase() : 'FA',
      position: position as Position,
      posRank,
      bye,
      upside: iUpside >= 0 ? starRatingToScore(cells[iUpside] ?? '') : 50,
      bust: iBust >= 0 ? starRatingToScore(cells[iBust] ?? '') : 50,
      adp: Math.max(1, rk + delta),
    })
  }

  return { rows, errors }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function tagsFor(row: AllRankingsRow): PlayerTag[] {
  const tags: PlayerTag[] = []
  const delta = row.adp - row.rk // positive = market takes him later than rank -> value
  if (delta >= 15) tags.push('value')
  if (delta <= -15) tags.push('avoid-at-cost')
  if (row.upside >= 80 && row.bust >= 70) tags.push('sleeper')
  if (row.bust >= 80) tags.push('injury-concern')
  return tags
}

/**
 * Turn parsed rows into `Player[]`.
 *
 * `rk` and `adp` are used AS-IS - this file's overall order is a real
 * cross-position ranking, not something this app has to derive. Only
 * per-position tiers are computed here, using the same value-over-replacement
 * curve `valueBoard.ts` uses for the positional-only sheet, because the file's
 * own TIERS column spans every position at once and does not map cleanly onto
 * this app's per-position tier model.
 */
export function buildPlayersFromAllRankings(rows: AllRankingsRow[], settings: LeagueSettings): Player[] {
  const byPosition = new Map<Position, AllRankingsRow[]>()
  for (const r of rows) {
    const arr = byPosition.get(r.position)
    if (arr) arr.push(r)
    else byPosition.set(r.position, [r])
  }

  const tierByKey = new Map<string, number>()
  for (const [pos, arr] of byPosition) {
    arr.sort((a, b) => a.posRank - b.posRank)
    // real ADP is a better tiering signal than an estimated points curve, and
    // it is what this file actually gives us: lower ADP = more value.
    const values = arr.map((r) => -r.adp)
    const tiers = assignTiers(values, { starterCount: replacementRank(pos, settings) })
    arr.forEach((r, i) => tierByKey.set(`${pos}|${r.posRank}`, tiers[i]))
  }

  const sorted = [...rows].sort((a, b) => a.rk - b.rk)
  const seen = new Set<string>()

  return sorted.map((r) => {
    let id = `${slugify(r.name)}-${r.team.toLowerCase()}`
    let n = 2
    while (seen.has(id)) id = `${slugify(r.name)}-${r.team.toLowerCase()}-${n++}`
    seen.add(id)

    const risk = Math.round(r.bust)
    const floor = Math.max(0, 100 - risk) // no floor rating on this sheet; bust is its best proxy

    return {
      id,
      name: r.name,
      team: r.team,
      position: r.position,
      bye: r.bye,
      overallRank: r.rk,
      posRank: r.posRank,
      tier: tierByKey.get(`${r.position}|${r.posRank}`) ?? 1,
      adp: Math.round(r.adp * 10) / 10,
      // No point projection on this sheet. The same points-by-posRank curve
      // `valueBoard.ts` uses for the positional-only sheet gives the engine's
      // "projected opportunity" score something ranking-consistent to work with.
      projPoints: projectedPoints(r.position, r.posRank, settings.scoring),
      upside: Math.round(r.upside),
      floor,
      risk,
      notes: '',
      tags: tagsFor(r),
      rationale: `${r.position}${r.posRank} overall #${r.rk} on FantasyPros' 2026 PPR board (tier ${
        tierByKey.get(`${r.position}|${r.posRank}`) ?? 1
      }).`,
      customRank: null,
    }
  })
}
