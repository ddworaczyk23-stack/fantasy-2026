import { useState } from 'react'
import type { ScoredPlayer } from '../../types'
import Panel from '../Panel'
import StatBar from '../StatBar'

const COMPONENT_LABELS: { key: keyof ScoredPlayer['breakdown']; label: string }[] = [
  { key: 'consensus', label: 'Consensus rank' },
  { key: 'opportunity', label: 'Opportunity' },
  { key: 'scarcity', label: 'Scarcity' },
  { key: 'adpValue', label: 'ADP value' },
  { key: 'fit', label: 'Roster fit' },
  { key: 'upside', label: 'Upside' },
]

export default function StrategyPanel({
  strategyExplanation,
  primary,
}: {
  strategyExplanation: string
  primary: ScoredPlayer | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <Panel title="Strategy Explanation" subtitle="Why the engine is recommending this">
      <p className="text-dim text-sm">{strategyExplanation || 'No recommendation to explain yet.'}</p>

      {primary && (
        <>
          <button
            type="button"
            className="btn btn-sm mt-md"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? 'Hide' : 'Show'} score breakdown for {primary.player.name}
          </button>
          {open && (
            <div className="flex-col mt-sm">
              {COMPONENT_LABELS.map(({ key, label }) => (
                <StatBar
                  key={key}
                  label={label}
                  value={Math.abs(primary.breakdown[key]) * 100}
                  valueLabel={primary.breakdown[key].toFixed(2)}
                />
              ))}
              {primary.breakdown.riskPenalty !== 0 && (
                <StatBar
                  label="Risk penalty"
                  value={Math.min(100, Math.abs(primary.breakdown.riskPenalty) * 100)}
                  tone="critical"
                  valueLabel={primary.breakdown.riskPenalty.toFixed(2)}
                />
              )}
              {primary.breakdown.runAdjustment !== 0 && (
                <StatBar
                  label="Run / need adjustment"
                  value={Math.min(100, Math.abs(primary.breakdown.runAdjustment) * 100)}
                  tone="warn"
                  valueLabel={primary.breakdown.runAdjustment.toFixed(2)}
                />
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
