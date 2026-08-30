import { useEffect, useRef, useState } from 'react'
import { useDraftStore } from '../../store/draftStore'
import { describeSleeperStatus, type SleeperLeagueSummary } from '../../services/sleeperAdapter'
import Panel from '../Panel'

type Busy = null | 'connect' | 'leagues' | 'import' | 'sync'

export default function SleeperPanel() {
  const sleeper = useDraftStore((s) => s.sleeper)
  const setSleeper = useDraftStore((s) => s.setSleeper)
  const sleeperConnect = useDraftStore((s) => s.sleeperConnect)
  const sleeperListLeagues = useDraftStore((s) => s.sleeperListLeagues)
  const sleeperImportLeague = useDraftStore((s) => s.sleeperImportLeague)
  const sleeperSyncPicks = useDraftStore((s) => s.sleeperSyncPicks)

  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState<string>('')
  const [tone, setTone] = useState<'good' | 'warn' | 'neutral'>('neutral')
  const [notes, setNotes] = useState<string[]>([])
  const [leagues, setLeagues] = useState<SleeperLeagueSummary[] | null>(null)

  const status = describeSleeperStatus(sleeper.status)

  function report(res: { ok: boolean; message: string; notes?: string[] }) {
    setMessage(res.message)
    setTone(res.ok ? 'good' : 'warn')
    setNotes(res.notes ?? [])
  }

  async function run(kind: Exclude<Busy, null>, fn: () => Promise<{ ok: boolean; message: string; notes?: string[] }>) {
    setBusy(kind)
    try {
      report(await fn())
    } catch (e) {
      report({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  // Auto-sync itself runs in AppShell (always mounted) so it keeps polling
  // no matter which tab is open. This panel just shows the latest result
  // when the user is looking at it.
  const lastResultRef = useRef(sleeper.lastSyncAt)
  useEffect(() => {
    if (sleeper.lastSyncAt !== lastResultRef.current) {
      lastResultRef.current = sleeper.lastSyncAt
      if (sleeper.autoSync) {
        setMessage(sleeper.lastError ?? 'Auto-sync ran.')
        setTone(sleeper.lastError ? 'warn' : 'good')
      }
    }
  }, [sleeper.lastSyncAt, sleeper.lastError, sleeper.autoSync])

  const lastSync = sleeper.lastSyncAt ? new Date(sleeper.lastSyncAt).toLocaleTimeString() : 'never'

  return (
    <Panel title="Sleeper Sync" subtitle="Pull your real league and live draft picks">
      <p className="muted text-sm">
        Sleeper&apos;s read API is public. There is no password, no API key and nothing secret is
        stored. Sync is optional — manual entry always works and never depends on the network.
      </p>

      <div className="row gap-sm items-center mt-sm">
        <span className={`status-dot status-${status.tone}`} aria-hidden="true" />
        <strong>{status.label}</strong>
        <span className="muted text-sm">{status.detail}</span>
      </div>

      <div className="form-grid mt-md">
        <label htmlFor="sleeper-user">Sleeper username</label>
        <input
          id="sleeper-user"
          type="text"
          value={sleeper.username}
          autoComplete="off"
          onChange={(e) => setSleeper({ username: e.target.value })}
          placeholder="your Sleeper handle"
        />

        <label htmlFor="sleeper-season">Season</label>
        <input
          id="sleeper-season"
          type="text"
          inputMode="numeric"
          value={sleeper.season}
          onChange={(e) => setSleeper({ season: e.target.value })}
        />

        <label htmlFor="sleeper-league">League ID</label>
        <input
          id="sleeper-league"
          type="text"
          value={sleeper.leagueId}
          autoComplete="off"
          onChange={(e) => setSleeper({ leagueId: e.target.value })}
          placeholder="e.g. 1234567890123456789"
        />

        <label htmlFor="sleeper-adapter">Data source</label>
        <select
          id="sleeper-adapter"
          value={sleeper.adapter}
          onChange={(e) => setSleeper({ adapter: e.target.value === 'mock' ? 'mock' : 'live' })}
        >
          <option value="live">Live — api.sleeper.app</option>
          <option value="mock">Mock — canned data, no network</option>
        </select>
      </div>

      <div className="row gap-sm mt-md wrap">
        <button
          type="button"
          className="btn"
          disabled={busy !== null || !sleeper.username.trim()}
          onClick={() => void run('connect', sleeperConnect)}
        >
          {busy === 'connect' ? 'Connecting…' : '1. Connect account'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null || !sleeper.userId}
          onClick={() =>
            void run('leagues', async () => {
              const res = await sleeperListLeagues()
              setLeagues(res.leagues ?? [])
              return res
            })
          }
        >
          {busy === 'leagues' ? 'Loading…' : '2. Find my leagues'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null || !sleeper.leagueId.trim()}
          onClick={() => void run('import', sleeperImportLeague)}
        >
          {busy === 'import' ? 'Importing…' : '3. Import league settings'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null || !sleeper.draftId}
          onClick={() => void run('sync', sleeperSyncPicks)}
        >
          {busy === 'sync' ? 'Syncing…' : '4. Sync draft picks now'}
        </button>
      </div>

      {leagues !== null && (
        <div className="mt-md">
          <h4 className="text-sm">Your {sleeper.season} leagues</h4>
          {leagues.length === 0 ? (
            <p className="muted text-sm">
              No NFL leagues on that account for {sleeper.season}. Check the season, or paste the
              league ID straight from the Sleeper app URL.
            </p>
          ) : (
            <ul className="plain-list">
              {leagues.map((l) => (
                <li key={l.leagueId} className="row gap-sm items-center">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setSleeper({ leagueId: l.leagueId })}
                  >
                    Use
                  </button>
                  <span>{l.name}</span>
                  <span className="muted text-sm">
                    {l.totalRosters} teams · {l.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="row gap-sm items-center mt-md wrap">
        <label className="row gap-sm items-center">
          <input
            type="checkbox"
            checked={sleeper.autoSync}
            disabled={!sleeper.draftId}
            onChange={(e) => setSleeper({ autoSync: e.target.checked })}
          />
          <span>Auto-sync during the draft</span>
        </label>
        <label htmlFor="sleeper-poll" className="text-sm">
          every
        </label>
        <input
          id="sleeper-poll"
          type="number"
          min={5}
          max={120}
          className="input-narrow"
          value={sleeper.pollSeconds}
          onChange={(e) => setSleeper({ pollSeconds: Math.max(5, Number(e.target.value) || 8) })}
        />
        <span className="text-sm">seconds</span>
        <span className="muted text-sm">Last sync: {lastSync}</span>
      </div>
      <p className="muted text-sm">
        Minimum 5 seconds. Sleeper asks for under 1000 calls per minute; at 8 seconds this makes
        about 7.
      </p>

      {message && (
        <p className={`callout callout-${tone} mt-md`} role="status">
          {tone === 'warn' ? '⚠ ' : '✓ '}
          {message}
        </p>
      )}

      {notes.length > 0 && (
        <ul className="plain-list text-sm mt-sm">
          {notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}

      {sleeper.unmatched.length > 0 && (
        <div className="callout callout-warn mt-md">
          <strong>⚠ {sleeper.unmatched.length} pick(s) not on your board</strong>
          <p className="text-sm">
            These were drafted in Sleeper but no matching player exists in your rankings. Draft them
            manually, or add them to your CSV, so the board stays accurate.
          </p>
          <ul className="plain-list text-sm">
            {sleeper.unmatched.slice(0, 12).map((u) => (
              <li key={`${u.pickNumber}-${u.playerName}`}>
                Pick {u.pickNumber}: {u.playerName || '(no name)'} {u.position} {u.team}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sleeper.lastError && (
        <p className="callout callout-warn mt-sm" role="alert">
          ⚠ {sleeper.lastError}
        </p>
      )}
    </Panel>
  )
}
