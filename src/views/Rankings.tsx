import { useMemo, useRef, useState } from 'react'
import { useDraftStore } from '../store/draftStore'
import { SAMPLE_DATA_LABEL, makeSamplePlayers } from '../data/samplePlayers'
import { FP_DERIVED_LABEL, FP_SOURCE_LABEL, makeFantasyProsBoard } from '../data/fantasyProsBoard'
import { csvTemplate, playersToCsv, parsePlayersCsv, downloadText } from '../services/csv'
import { POSITIONS } from '../types'
import type { CsvImportResult, Position } from '../types'
import { describeBoardSource, setBoardSource, useBoardSource } from '../components/sampleDataFlag'
import Panel from '../components/Panel'
import EmptyState from '../components/EmptyState'
import ConfirmButton from '../components/ConfirmButton'
import RankRow from '../components/rankings/RankRow'

export default function Rankings() {
  const settings = useDraftStore((s) => s.settings)
  const players = useDraftStore((s) => s.players)
  const setPlayers = useDraftStore((s) => s.setPlayers)
  const updatePlayer = useDraftStore((s) => s.updatePlayer)
  const togglePlayerTag = useDraftStore((s) => s.togglePlayerTag)
  const boardSource = useBoardSource()
  const boardBadge = describeBoardSource(boardSource)

  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<Set<Position>>(new Set())
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const filtered = useMemo(() => {
    let list = players
    if (posFilter.size > 0) list = list.filter((p) => posFilter.has(p.position))
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
    return [...list].sort((a, b) => (a.customRank ?? a.overallRank) - (b.customRank ?? b.overallRank))
  }, [players, search, posFilter])

  function togglePos(pos: Position) {
    setPosFilter((prev) => {
      const next = new Set(prev)
      if (next.has(pos)) next.delete(pos)
      else next.add(pos)
      return next
    })
  }

  function handleMove(id: string, delta: number) {
    const p = players.find((pl) => pl.id === id)
    if (!p) return
    const base = p.customRank ?? p.overallRank
    updatePlayer(id, { customRank: Math.max(1, base + delta) })
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setImportResult(parsePlayersCsv(text))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function confirmImport() {
    if (!importResult) return
    setPlayers(importResult.players)
    setBoardSource('imported')
    setImportResult(null)
  }

  function resetAllOverrides() {
    for (const p of players) {
      if (p.customRank !== null) updatePlayer(p.id, { customRank: null })
    }
  }

  if (players.length === 0) {
    return (
      <EmptyState
        title="No players loaded"
        description="Load the bundled sample board from Settings, or import a CSV below, to start ranking players."
      />
    )
  }

  return (
    <div className="draft-room">
      <div className="draft-room__col" style={{ gridColumn: '1 / -1' }}>
        <Panel title="Board in use" subtitle={boardBadge.text}>
          {boardSource === 'fantasypros' && (
            <>
              <p className="text-sm">{FP_SOURCE_LABEL}</p>
              <p className="text-dim text-sm">{FP_DERIVED_LABEL}</p>
              <ul className="plain-list text-dim text-sm">
                <li>
                  • This sheet has no ADP, so &quot;value vs ADP&quot; reads neutral. Import a file with
                  an ADP column to switch that signal on.
                </li>
                <li>• No bye weeks on this sheet, so bye-conflict warnings stay off.</li>
                <li>• Upside, floor and risk are neutral. Tag players below to steer the engine.</li>
              </ul>
            </>
          )}
          {boardSource === 'imported' && (
            <p className="text-dim text-sm">
              These rankings came from a file you imported. Reload a bundled board below if you want
              to start over.
            </p>
          )}
          {boardSource === 'sample' && (
            <p className="text-dim text-sm">
              You are on invented demo data ({SAMPLE_DATA_LABEL}). Load the FantasyPros board or
              import your own before draft day.
            </p>
          )}
          <div className="flex-row flex-wrap mt-sm">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPlayers(makeFantasyProsBoard(settings).players)
                setBoardSource('fantasypros')
              }}
            >
              Load FantasyPros 2026 board
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPlayers(makeSamplePlayers())
                setBoardSource('sample')
              }}
            >
              Load demo sample board
            </button>
          </div>
        </Panel>

        <Panel title="Import / Export">
          <div className="flex-row flex-wrap">
            <button type="button" className="btn" onClick={() => downloadText('player-template.csv', csvTemplate())}>
              Download blank template
            </button>
            <button type="button" className="btn" onClick={() => downloadText('draft-board.csv', playersToCsv(players))}>
              Download current board
            </button>
            <label className="btn" htmlFor="csv-upload">
              Upload CSV…
            </label>
            <input
              id="csv-upload"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={handleFileChosen}
            />
            <ConfirmButton onConfirm={resetAllOverrides} className="btn" confirmLabel="Confirm reset overrides?">
              Reset overrides
            </ConfirmButton>
          </div>

          {importResult && (
            <div className="mt-md" style={{ border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: 12 }}>
              <div className="font-bold">
                Import preview — {importResult.rowCount} row{importResult.rowCount === 1 ? '' : 's'} read,{' '}
                {importResult.players.length} player{importResult.players.length === 1 ? '' : 's'} parsed
              </div>
              {importResult.errors.length > 0 && (
                <div className="mt-sm">
                  <div className="text-xs font-bold" style={{ color: 'var(--critical)' }}>
                    ERRORS ({importResult.errors.length})
                  </div>
                  <ul className="reasons-list">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {importResult.warnings.length > 0 && (
                <div className="mt-sm">
                  <div className="text-xs font-bold" style={{ color: 'var(--warn)' }}>
                    WARNINGS ({importResult.warnings.length})
                  </div>
                  <ul className="reasons-list">
                    {importResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex-row mt-sm">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmImport}
                  disabled={importResult.players.length === 0}
                >
                  Confirm replace board ({importResult.players.length} players)
                </button>
                <button type="button" className="btn" onClick={() => setImportResult(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Rankings" subtitle={`${filtered.length} of ${players.length} players`} tall>
          <div className="search-box">
            <span aria-hidden="true">🔎</span>
            <input
              type="search"
              placeholder="Search by name or team…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search players"
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
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="No players match" description="Try clearing the search or position filter." />
          ) : (
            <div className="table-wrap mt-sm">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Pos</th>
                    <th>Team</th>
                    <th>Tier</th>
                    <th>ADP</th>
                    <th>Custom rank</th>
                    <th>Nudge</th>
                    <th>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <RankRow
                      key={p.id}
                      player={p}
                      effectiveRank={p.customRank ?? p.overallRank}
                      onSetCustomRank={(v) => updatePlayer(p.id, { customRank: v })}
                      onClearCustomRank={() => updatePlayer(p.id, { customRank: null })}
                      onMove={(delta) => handleMove(p.id, delta)}
                      onToggleTag={(tag) => togglePlayerTag(p.id, tag)}
                      onSetTier={(tier) => updatePlayer(p.id, { tier })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
