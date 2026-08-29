import { useEffect, useMemo, useState, forwardRef } from 'react'
import type { Caution, LeagueTeam, Position, ScoredPlayer } from '../../types'
import { POSITIONS } from '../../types'
import Panel from '../Panel'
import PlayerRow from '../PlayerRow'
import EmptyState from '../EmptyState'

type SortKey = 'rank' | 'name' | 'pos' | 'bye' | 'tier' | 'adp' | 'value' | 'proj' | 'score'

const PAGE_SIZE = 120

const AvailablePlayersPanel = forwardRef<HTMLInputElement, {
  scored: ScoredPlayer[]
  teams: LeagueTeam[]
  cautions: Caution[]
  onDraft: (playerId: string) => void
  onMarkDrafted: (playerId: string, teamId: string) => void
  search: string
  onSearchChange: (v: string) => void
  onVisibleRowsChange: (ids: string[]) => void
}>(function AvailablePlayersPanel(
  { scored, teams, cautions, onDraft, onMarkDrafted, search, onSearchChange, onVisibleRowsChange },
  searchRef,
) {
  const [posFilter, setPosFilter] = useState<Set<Position>>(new Set())
  const [hideKDst, setHideKDst] = useState(false)
  const [riskOnly, setRiskOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const cautionByPlayerId = useMemo(() => {
    const m = new Map<string, Caution>()
    for (const c of cautions) m.set(c.playerId, c)
    return m
  }, [cautions])

  function togglePos(pos: Position) {
    setPosFilter((prev) => {
      const next = new Set(prev)
      if (next.has(pos)) next.delete(pos)
      else next.add(pos)
      return next
    })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const filtered = useMemo(() => {
    let list = scored
    if (posFilter.size > 0) list = list.filter((s) => posFilter.has(s.player.position))
    if (hideKDst) list = list.filter((s) => s.player.position !== 'K' && s.player.position !== 'DST')
    if (riskOnly) list = list.filter((s) => s.riskFlags.length > 0)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (s) =>
          s.player.name.toLowerCase().includes(q) ||
          s.player.team.toLowerCase().includes(q) ||
          s.player.position.toLowerCase().includes(q),
      )
    }

    const dir = sortDir === 'asc' ? 1 : -1
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.player.name.localeCompare(b.player.name)
        case 'pos':
          return dir * a.player.position.localeCompare(b.player.position)
        case 'bye':
          return dir * (a.player.bye - b.player.bye)
        case 'tier':
          return dir * (a.player.tier - b.player.tier)
        case 'adp':
          return dir * (a.player.adp - b.player.adp)
        case 'value':
          return dir * (a.valueVsAdp - b.valueVsAdp)
        case 'proj':
          return dir * (a.player.projPoints - b.player.projPoints)
        case 'score':
          return dir * (a.score - b.score)
        case 'rank':
        default:
          return dir * (a.player.overallRank - b.player.overallRank)
      }
    })
    return sorted
  }, [scored, posFilter, hideKDst, riskOnly, search, sortKey, sortDir])

  const visible = filtered.slice(0, limit)

  // Report the currently visible ordered ids up so the number-key shortcuts can
  // draft them. This MUST be an effect, not a useMemo: calling the parent's
  // setter during render updates another component mid-render, which React
  // warns about and which can wedge the draft board.
  const visibleIds = visible.map((s) => s.player.id).join(',')
  useEffect(() => {
    onVisibleRowsChange(visibleIds ? visibleIds.split(',') : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds])

  function sortHeader(key: SortKey, label: string) {
    const active = sortKey === key
    return (
      <th key={key}>
        <button type="button" onClick={() => toggleSort(key)} aria-label={`Sort by ${label}`}>
          {label} {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
        </button>
      </th>
    )
  }

  return (
    <Panel title="Available Players" subtitle={`${filtered.length} match your filters`} tall>
      <div className="search-box">
        <span aria-hidden="true">🔎</span>
        <input
          ref={searchRef}
          type="search"
          placeholder="Search by name, team, or position… (press / to focus)"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search available players"
        />
      </div>

      <div className="filter-chips mt-sm">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            type="button"
            className="filter-chip"
            aria-pressed={posFilter.has(pos)}
            onClick={() => togglePos(pos)}
          >
            {pos}
          </button>
        ))}
        <button type="button" className="filter-chip" aria-pressed={hideKDst} onClick={() => setHideKDst((v) => !v)}>
          Hide DST/K
        </button>
        <button type="button" className="filter-chip" aria-pressed={riskOnly} onClick={() => setRiskOnly((v) => !v)}>
          Risk flags only
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No players match"
          description="Nobody available fits your current filters or search. Try clearing a filter or search term."
        />
      ) : (
        <div className="table-wrap mt-sm">
          <table className="data-table">
            <thead>
              <tr>
                {sortHeader('rank', '#')}
                {sortHeader('name', 'Name')}
                {sortHeader('pos', 'Pos')}
                <th>Team</th>
                {sortHeader('bye', 'Bye')}
                {sortHeader('tier', 'Tier')}
                {sortHeader('adp', 'ADP')}
                {sortHeader('value', 'Value vs ADP')}
                {sortHeader('proj', 'Proj')}
                {sortHeader('score', 'Score')}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s, i) => (
                <PlayerRow
                  key={s.player.id}
                  rank={i + 1}
                  scored={s}
                  teams={teams}
                  onDraft={() => onDraft(s.player.id)}
                  onMarkDrafted={(teamId) => onMarkDrafted(s.player.id, teamId)}
                  shortcutHint={i < 6 ? i + 1 : undefined}
                  caution={cautionByPlayerId.get(s.player.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > limit && (
        <button type="button" className="btn btn-sm mt-sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          Show more ({filtered.length - limit} remaining)
        </button>
      )}
    </Panel>
  )
})

export default AvailablePlayersPanel
