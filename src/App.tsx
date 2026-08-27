import { useEffect, useState } from 'react'
import { useDraftStore, useEngineContext, useRecommendation } from './store/draftStore'
import { teamForPick } from './engine/picks'
import { useIsSampleData } from './components/sampleDataFlag'
import ErrorBoundary from './components/ErrorBoundary'
import ConfirmButton from './components/ConfirmButton'
import DraftRoom from './views/DraftRoom'
import MyTeam from './views/MyTeam'
import Rankings from './views/Rankings'
import LeagueIntel from './views/LeagueIntel'
import SettingsView from './views/SettingsView'

type Tab = 'draft' | 'myteam' | 'rankings' | 'intel' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'draft', label: 'Draft Room' },
  { id: 'myteam', label: 'My Team' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'intel', label: 'League Intel' },
  { id: 'settings', label: 'Settings' },
]

function getStoredTheme(): 'dark' | 'light' {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'light' ? 'light' : 'dark'
}

function AppShell() {
  const [tab, setTab] = useState<Tab>('draft')
  const [theme, setTheme] = useState<'dark' | 'light'>(getStoredTheme)

  const hydrate = useDraftStore((s) => s.hydrate)
  const hydrated = useDraftStore((s) => s.hydrated)
  const teams = useDraftStore((s) => s.teams)
  const settings = useDraftStore((s) => s.settings)
  const undoLastPick = useDraftStore((s) => s.undoLastPick)
  const exportJson = useDraftStore((s) => s.exportJson)
  const resetAll = useDraftStore((s) => s.resetAll)
  const picks = useDraftStore((s) => s.picks)

  const ctx = useEngineContext()
  const recommendation = useRecommendation()
  const isSample = useIsSampleData()

  useEffect(() => {
    hydrate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  function exportStateNow() {
    try {
      const json = exportJson()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ddcc-state-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // best-effort export; nothing more we can do in a broken environment
    }
  }

  const clockTeam = teamForPick(ctx.currentPick, teams, settings)
  const onTheClock = recommendation.onTheClock
  const draftComplete = picks.length >= settings.teams * settings.rounds

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__brand">Draft Day Command Center</div>
        {isSample && <span className="sample-badge">SAMPLE DATA — NOT LIVE</span>}
        <div className="pick-indicator">
          {draftComplete ? (
            <strong>Draft complete</strong>
          ) : (
            <>
              <span>
                Round <strong>{recommendation.round}</strong> · Pick{' '}
                <strong>{ctx.currentPick}</strong>
              </span>
              <span>
                on the clock: <strong>{clockTeam ? clockTeam.name : '—'}</strong>
              </span>
            </>
          )}
        </div>
        {onTheClock && !draftComplete && <span className="your-pick-flag">YOUR PICK</span>}
        <div className="app-header__spacer" />
        <button
          type="button"
          className="icon-btn"
          onClick={() => undoLastPick()}
          disabled={picks.length === 0}
          aria-label="Undo last pick"
        >
          Undo
        </button>
        <button type="button" className="icon-btn" onClick={exportStateNow} aria-label="Export state as JSON">
          Export
        </button>
        <ConfirmButton
          onConfirm={() => resetAll()}
          className="icon-btn"
          ariaLabel="Reset everything"
          confirmLabel="Confirm reset?"
        >
          Reset
        </ConfirmButton>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <nav className="tab-nav" aria-label="Main views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tab-nav__btn"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="view">
        {!hydrated ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <>
            {tab === 'draft' && <DraftRoom />}
            {tab === 'myteam' && <MyTeam />}
            {tab === 'rankings' && <Rankings />}
            {tab === 'intel' && <LeagueIntel />}
            {tab === 'settings' && <SettingsView />}
          </>
        )}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  )
}
