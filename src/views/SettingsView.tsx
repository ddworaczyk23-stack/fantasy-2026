import { useState } from 'react'
import { useDraftStore } from '../store/draftStore'
import { myPickNumbers } from '../engine/picks'
import type { RosterSlots, ScoringFormat } from '../types'
import Panel from '../components/Panel'
import WeightsPanel from '../components/settings/WeightsPanel'
import SleeperPanel from '../components/settings/SleeperPanel'
import ImportExportPanel from '../components/settings/ImportExportPanel'
import ChecklistPanel from '../components/settings/ChecklistPanel'
import LeaguesPanel from '../components/settings/LeaguesPanel'

const ROSTER_KEYS: (keyof RosterSlots)[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BENCH']
const SCORING_OPTIONS: { value: ScoringFormat; label: string }[] = [
  { value: 'ppr', label: 'Full PPR' },
  { value: 'half', label: 'Half PPR' },
  { value: 'standard', label: 'Standard' },
]

export default function SettingsView() {
  const settings = useDraftStore((s) => s.settings)
  const setSettings = useDraftStore((s) => s.setSettings)
  const weights = useDraftStore((s) => s.weights)
  const setWeights = useDraftStore((s) => s.setWeights)
  const sleeper = useDraftStore((s) => s.sleeper)
  const setSleeper = useDraftStore((s) => s.setSleeper)

  const [overrideText, setOverrideText] = useState(() => (settings.myPickOverrides ?? []).join(', '))

  const resolvedPicks = myPickNumbers(settings)

  function applyOverrideText(text: string) {
    setOverrideText(text)
    const nums = text
      .split(',')
      .map((t) => Number(t.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
    setSettings({ myPickOverrides: nums.length > 0 ? nums : null })
  }

  function clearOverride() {
    setOverrideText('')
    setSettings({ myPickOverrides: null })
  }

  function setRosterSlot(key: keyof RosterSlots, value: number) {
    setSettings({ roster: { ...settings.roster, [key]: Math.max(0, value) } })
  }

  return (
    <div className="draft-room">
      <div className="draft-room__col">
        <LeaguesPanel />
        <Panel title="League Settings">
          <div className="flex-col">
            <div className="field">
              <label htmlFor="set-teams">Teams</label>
              <input
                id="set-teams"
                type="number"
                min={2}
                max={32}
                value={settings.teams}
                onChange={(e) => setSettings({ teams: Number(e.target.value) || settings.teams })}
              />
            </div>
            <div className="field">
              <label htmlFor="set-scoring">Scoring</label>
              <select
                id="set-scoring"
                value={settings.scoring}
                onChange={(e) => setSettings({ scoring: e.target.value as ScoringFormat })}
              >
                {SCORING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex-row">
              <input
                type="checkbox"
                checked={settings.superflex}
                onChange={(e) => setSettings({ superflex: e.target.checked })}
              />
              Superflex
            </label>
            <div className="field">
              <label htmlFor="set-rounds">Rounds</label>
              <input
                id="set-rounds"
                type="number"
                min={1}
                max={30}
                value={settings.rounds}
                onChange={(e) => setSettings({ rounds: Number(e.target.value) || settings.rounds })}
              />
            </div>
            <label className="flex-row">
              <input type="checkbox" checked={settings.snake} onChange={(e) => setSettings({ snake: e.target.checked })} />
              Snake draft
            </label>
            <label className="flex-row">
              <input
                type="checkbox"
                checked={settings.thirdRoundReversal}
                onChange={(e) => setSettings({ thirdRoundReversal: e.target.checked })}
              />
              Third-round reversal
            </label>
            <div className="field">
              <label htmlFor="set-myslot">My draft slot</label>
              <input
                id="set-myslot"
                type="number"
                min={1}
                max={settings.teams}
                value={settings.mySlot}
                onChange={(e) => setSettings({ mySlot: Number(e.target.value) || settings.mySlot })}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Roster Slots">
          <div className="flex-col">
            {ROSTER_KEYS.map((key) => (
              <div className="field" key={key}>
                <label htmlFor={`roster-${key}`}>{key}</label>
                <input
                  id={`roster-${key}`}
                  type="number"
                  min={0}
                  max={12}
                  value={settings.roster[key]}
                  onChange={(e) => setRosterSlot(key, Number(e.target.value) || 0)}
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="My Pick Numbers" subtitle="An explicit override always wins over snake math">
          <div className="field">
            <label htmlFor="pick-overrides">Overrides (comma-separated overall pick numbers)</label>
            <input
              id="pick-overrides"
              type="text"
              value={overrideText}
              onChange={(e) => applyOverrideText(e.target.value)}
              placeholder="8, 20, 33, 45, ..."
            />
            <span className="field-hint">
              Default matches a 1.08 / 2.08 / 3.09 board (8th pick, snake, 9th-thereafter) — type your
              real board here if it differs from standard snake math.
            </span>
          </div>
          <button type="button" className="btn btn-sm mt-sm" onClick={clearOverride}>
            Clear override / use snake
          </button>
          <div className="mt-sm">
            <span className="text-xs text-muted font-bold">RESOLVED PICKS</span>
            <p className="text-sm text-dim mt-sm">{resolvedPicks.slice(0, 20).join(', ')}{resolvedPicks.length > 20 ? '…' : ''}</p>
          </div>
        </Panel>
      </div>

      <div className="draft-room__col">
        <Panel title="DST / K Rule">
          <div className="field">
            <label htmlFor="kdst-rounds">Don't recommend DST/K until this many rounds remain</label>
            <input
              id="kdst-rounds"
              type="number"
              min={0}
              max={settings.rounds}
              value={settings.kdstLastRounds}
              onChange={(e) => setSettings({ kdstLastRounds: Number(e.target.value) || 0 })}
            />
          </div>
          <label className="flex-row mt-sm">
            <input
              type="checkbox"
              checked={settings.allowEarlyKDst}
              onChange={(e) => setSettings({ allowEarlyKDst: e.target.checked })}
            />
            Allow early DST/K recommendations (override)
          </label>
        </Panel>

        <WeightsPanel weights={weights} onChange={setWeights} />
        <SleeperPanel />
      </div>

      <div className="draft-room__col">
        <ImportExportPanel />
        <ChecklistPanel />
      </div>
    </div>
  )
}
