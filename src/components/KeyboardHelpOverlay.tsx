const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: '/', desc: 'Focus the player search box' },
  { keys: 'Enter', desc: 'Draft the top search result (while searching)' },
  { keys: '1 – 6', desc: 'Draft that row (1st–6th) of the current list' },
  { keys: 'd', desc: 'Draft the recommended player' },
  { keys: 'u', desc: 'Undo the last pick' },
  { keys: 'Esc', desc: 'Clear search / close this overlay' },
  { keys: '?', desc: 'Toggle this help overlay' },
]

export default function KeyboardHelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="overlay-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="overlay-card"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-row" style={{ justifyContent: 'space-between' }}>
          <h2 className="panel__title">Keyboard shortcuts</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close shortcuts overlay">
            Close
          </button>
        </div>
        <div className="mt-md">
          {SHORTCUTS.map((s) => (
            <div className="kbd-row" key={s.keys}>
              <span className="kbd">{s.keys}</span>
              <span className="text-dim text-sm">{s.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-muted text-xs mt-md">
          Shortcuts are disabled while typing in a text field, except <span className="kbd">/</span> and{' '}
          <span className="kbd">Esc</span>.
        </p>
      </div>
    </div>
  )
}
