import { useState } from 'react'
import { useDraftStore } from '../../store/draftStore'
import Panel from '../Panel'
import ConfirmButton from '../ConfirmButton'

export default function LeaguesPanel() {
  const leagues = useDraftStore((s) => s.leagues)
  const leagueId = useDraftStore((s) => s.leagueId)
  const switchLeague = useDraftStore((s) => s.switchLeague)
  const createLeague = useDraftStore((s) => s.createLeague)
  const renameLeague = useDraftStore((s) => s.renameLeague)
  const deleteLeague = useDraftStore((s) => s.deleteLeague)
  const [newLeagueName, setNewLeagueName] = useState('')

  function create() {
    const name = newLeagueName.trim()
    if (!name) return
    createLeague(name)
    setNewLeagueName('')
  }

  return (
    <Panel title="Leagues" subtitle="Each league keeps its own draft, board, and settings.">
      <div className="flex-col">
        {leagues.map((league) => (
          <div className="flex-row flex-wrap" key={league.id}>
            <input
              aria-label={`League name: ${league.name}`}
              type="text"
              value={league.name}
              onChange={(e) => renameLeague(league.id, e.target.value)}
            />
            {league.id === leagueId ? (
              <span className="flex-row text-sm text-dim">
                <span className="status-dot status-good" aria-hidden="true" /> Active
              </span>
            ) : (
              <button type="button" className="btn btn-sm" onClick={() => switchLeague(league.id)}>
                Switch
              </button>
            )}
            <ConfirmButton
              onConfirm={() => deleteLeague(league.id)}
              className="btn btn-sm btn-danger"
              confirmLabel="Confirm delete?"
              disabled={leagues.length <= 1}
            >
              Delete
            </ConfirmButton>
          </div>
        ))}
        <div className="field">
          <label htmlFor="new-league-name">New league name</label>
          <div className="flex-row">
            <input
              id="new-league-name"
              type="text"
              value={newLeagueName}
              onChange={(e) => setNewLeagueName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create()
              }}
              placeholder="League name"
            />
            <button type="button" className="btn" onClick={create} disabled={!newLeagueName.trim()}>
              Create league
            </button>
          </div>
        </div>
      </div>
    </Panel>
  )
}
