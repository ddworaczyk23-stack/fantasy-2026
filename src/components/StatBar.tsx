export default function StatBar({
  label,
  value,
  max = 100,
  tone = 'accent',
  valueLabel,
}: {
  label: string
  value: number
  max?: number
  tone?: 'accent' | 'good' | 'warn' | 'critical'
  valueLabel?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const fillClass = tone === 'accent' ? 'stat-bar__fill' : `stat-bar__fill stat-bar__fill--${tone}`
  return (
    <div className="stat-bar">
      <div className="stat-bar__row">
        <span>{label}</span>
        <span>{valueLabel ?? Math.round(value)}</span>
      </div>
      <div
        className="stat-bar__track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
