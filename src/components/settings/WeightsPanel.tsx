import type { Weights } from '../../types'
import { DEFAULT_WEIGHTS } from '../../engine/defaults'
import Panel from '../Panel'

const SLIDERS: { key: keyof Weights; label: string; hint: string }[] = [
  { key: 'consensus', label: 'Consensus rank', hint: 'Expert / consensus rank' },
  { key: 'opportunity', label: 'Opportunity', hint: 'Projected PPR opportunity + role stability' },
  { key: 'scarcity', label: 'Scarcity', hint: 'Positional scarcity + tier-drop risk' },
  { key: 'adpValue', label: 'ADP value', hint: 'Value versus Sleeper ADP' },
  { key: 'fit', label: 'Roster fit', hint: 'Roster-construction fit' },
  { key: 'upside', label: 'Upside', hint: 'Upside / contingent value' },
]

export default function WeightsPanel({
  weights,
  onChange,
}: {
  weights: Weights
  onChange: (patch: Partial<Weights>) => void
}) {
  const sum = SLIDERS.reduce((acc, s) => acc + (weights[s.key] ?? 0), 0)

  return (
    <Panel
      title="Decision-Engine Weights"
      subtitle="Weights are normalised automatically, so they don't need to add to 100% exactly"
      right={
        <button type="button" className="btn btn-sm" onClick={() => onChange(DEFAULT_WEIGHTS)}>
          Restore defaults
        </button>
      }
    >
      <div className="flex-col">
        {SLIDERS.map((s) => (
          <div className="field" key={s.key}>
            <label htmlFor={`weight-${s.key}`}>
              {s.label} — {Math.round((weights[s.key] ?? 0) * 100)}%
            </label>
            <input
              id={`weight-${s.key}`}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={weights[s.key] ?? 0}
              onChange={(e) => onChange({ [s.key]: Number(e.target.value) } as Partial<Weights>)}
            />
            <span className="field-hint">{s.hint}</span>
          </div>
        ))}
        <p className="text-sm font-bold mt-sm">Sums to {Math.round(sum * 100)}% (normalised to 100% when applied)</p>
      </div>
    </Panel>
  )
}
