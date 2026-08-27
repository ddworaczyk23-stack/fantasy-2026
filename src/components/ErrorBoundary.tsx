import { Component, type ReactNode } from 'react'
import { useDraftStore } from '../store/draftStore'

function ErrorRecovery({ error, onReset }: { error: Error; onReset: () => void }) {
  function exportState() {
    try {
      const json = useDraftStore.getState().exportJson()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ddcc-state-recovery-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // if the store itself is broken there is nothing more we can do here
    }
  }

  return (
    <div className="error-boundary" role="alert">
      <h2 className="panel__title">Something went wrong</h2>
      <p className="text-dim">
        The app hit an unexpected error and can't render this screen safely.{' '}
        {error.message || 'No error message was provided.'}
      </p>
      <p className="text-dim">
        Your draft data is saved automatically as you go, so it's likely still intact. Export a
        backup now if you want to be safe, then reset the view to recover.
      </p>
      <div className="flex-row flex-wrap">
        <button type="button" className="btn" onClick={exportState}>
          Export state (backup)
        </button>
        <button type="button" className="btn btn-primary" onClick={onReset}>
          Reload app
        </button>
      </div>
    </div>
  )
}

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('DraftDayCommandCenter crashed:', error, info)
  }

  handleReset = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return <ErrorRecovery error={this.state.error} onReset={this.handleReset} />
    }
    return this.props.children
  }
}
