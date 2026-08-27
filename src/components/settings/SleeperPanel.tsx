import { useState } from 'react'
import type { SleeperConfig } from '../../types'
import { mockSleeperAdapter, describeSleeperStatus } from '../../services/sleeperAdapter'
import Panel from '../Panel'
import Chip from '../Chip'

export default function SleeperPanel({
  sleeper,
  onChange,
}: {
  sleeper: SleeperConfig
  onChange: (patch: Partial<SleeperConfig>) => void
}) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const status = describeSleeperStatus(sleeper.status)
  const tone = status.tone === 'good' ? 'good' : status.tone === 'warn' ? 'warn' : 'neutral'

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const userResult = await mockSleeperAdapter.verifyUser(sleeper.username)
      if (!userResult.ok) {
        setTestResult(userResult.message)
        return
      }
      if (sleeper.leagueId.trim()) {
        const leagueResult = await mockSleeperAdapter.fetchLeague(sleeper.leagueId, sleeper.season)
        setTestResult(`${userResult.message} ${leagueResult.message}`)
      } else {
        setTestResult(userResult.message)
      }
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Unknown error testing connection.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Panel title="Sleeper Sync" subtitle="Placeholder integration — manual mode is the reliable path">
      <p className="text-dim text-sm">
        Sleeper sync is a mock/placeholder in this build. It does not pull real draft data. Keep
        using manual mode (marking picks yourself in Draft Room) as your primary workflow —
        treat this section as a preview of what an eventual live sync would look like.
      </p>

      <div className="flex-col mt-sm">
        <div className="field">
          <label htmlFor="sleeper-username">Sleeper username</label>
          <input
            id="sleeper-username"
            type="text"
            value={sleeper.username}
            onChange={(e) => onChange({ username: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="sleeper-league">League ID</label>
          <input
            id="sleeper-league"
            type="text"
            value={sleeper.leagueId}
            onChange={(e) => onChange({ leagueId: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="sleeper-season">Season</label>
          <input
            id="sleeper-season"
            type="text"
            value={sleeper.season}
            onChange={(e) => onChange({ season: e.target.value })}
          />
        </div>
      </div>

      <div className="flex-row mt-sm flex-wrap">
        <Chip tone={tone}>{status.label}</Chip>
        <span className="text-xs text-muted">{status.detail}</span>
      </div>

      <button type="button" className="btn mt-sm" onClick={testConnection} disabled={testing}>
        {testing ? 'Testing…' : 'Test connection (mock)'}
      </button>
      {testResult && <p className="text-sm text-dim mt-sm">{testResult}</p>}
      {sleeper.lastError && <p className="text-sm mt-sm" style={{ color: 'var(--critical)' }}>Last error: {sleeper.lastError}</p>}
    </Panel>
  )
}
