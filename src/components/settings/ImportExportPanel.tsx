import { useRef, useState } from 'react'
import { useDraftStore } from '../../store/draftStore'
import { setIsSampleData } from '../sampleDataFlag'
import Panel from '../Panel'
import ConfirmButton from '../ConfirmButton'

export default function ImportExportPanel() {
  const exportJson = useDraftStore((s) => s.exportJson)
  const importJson = useDraftStore((s) => s.importJson)
  const loadSampleDraft = useDraftStore((s) => s.loadSampleDraft)
  const resetDraft = useDraftStore((s) => s.resetDraft)
  const resetAll = useDraftStore((s) => s.resetAll)

  const [importError, setImportError] = useState<string | null>(null)
  const [throughPick, setThroughPick] = useState(20)
  const fileRef = useRef<HTMLInputElement | null>(null)

  function exportNow() {
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
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const result = importJson(text)
      if (!result.ok) {
        setImportError(result.error ?? 'Import failed for an unknown reason.')
      } else {
        setImportError(null)
        setIsSampleData(false)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <Panel title="Import / Export State">
      <div className="flex-row flex-wrap">
        <button type="button" className="btn" onClick={exportNow}>
          Export state (JSON)
        </button>
        <label className="btn" htmlFor="state-upload">
          Import state (JSON)…
        </label>
        <input id="state-upload" ref={fileRef} type="file" accept="application/json" className="sr-only" onChange={handleFile} />
      </div>
      {importError && (
        <p className="text-sm mt-sm" style={{ color: 'var(--critical)' }}>
          Import failed: {importError}
        </p>
      )}

      <div className="divider" />

      <div className="field">
        <label htmlFor="sample-through">Load sample draft through pick #</label>
        <div className="flex-row">
          <input
            id="sample-through"
            type="number"
            min={0}
            style={{ width: 90 }}
            value={throughPick}
            onChange={(e) => setThroughPick(Number(e.target.value) || 0)}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              loadSampleDraft(throughPick)
              setIsSampleData(true)
            }}
          >
            Load sample draft
          </button>
        </div>
      </div>

      <div className="divider" />

      <div className="flex-row flex-wrap">
        <ConfirmButton onConfirm={resetDraft} className="btn btn-danger" confirmLabel="Confirm reset draft?">
          Reset draft (keep players/settings)
        </ConfirmButton>
        <ConfirmButton onConfirm={resetAll} className="btn btn-danger" confirmLabel="Confirm reset everything?">
          Reset everything
        </ConfirmButton>
      </div>
    </Panel>
  )
}
