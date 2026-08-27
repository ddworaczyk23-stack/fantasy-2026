import { useSyncExternalStore } from 'react'

// ============================================================================
// UI-only presentation flag: WHICH board is currently loaded.
//
// This is NOT part of the store contract (docs/CONTRACT.md deliberately does
// not expose it), so it lives here as a tiny external store the UI layer owns.
//
//   'fantasypros' - the bundled FantasyPros 2026 PPR ALL Rankings export.
//                   Real overall rank, tier, ADP and bye weeks.
//   'imported'    - the user replaced the board via CSV or a state import.
//   'sample'      - the invented demo board, only loaded on request.
// ============================================================================

export type BoardSource = 'fantasypros' | 'imported' | 'sample'

let source: BoardSource = 'fantasypros'
const listeners = new Set<() => void>()

export function getBoardSource(): BoardSource {
  return source
}

export function setBoardSource(value: BoardSource): void {
  if (source === value) return
  source = value
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBoardSource(): BoardSource {
  return useSyncExternalStore(subscribe, getBoardSource, getBoardSource)
}

export interface BoardBadge {
  text: string
  title: string
  tone: 'good' | 'warn'
}

export function describeBoardSource(s: BoardSource): BoardBadge {
  switch (s) {
    case 'fantasypros':
      return {
        text: 'FANTASYPROS 2026 PPR',
        title:
          'FantasyPros 2026 PPR draft rankings, 08/26/2026. Overall rank, ADP and bye weeks are ' +
          'from the file; only per-position tiers are re-cut here.',
        tone: 'good',
      }
    case 'imported':
      return {
        text: 'YOUR IMPORTED BOARD',
        title: 'These rankings came from a file you imported.',
        tone: 'good',
      }
    case 'sample':
    default:
      return {
        text: 'SAMPLE DATA — NOT LIVE',
        title: 'Invented demo data. Load the FantasyPros board or import your own before drafting.',
        tone: 'warn',
      }
  }
}

// --- Back-compat shims for existing call sites -----------------------------

/** @deprecated use useBoardSource() */
export function useIsSampleData(): boolean {
  return useBoardSource() === 'sample'
}

/** @deprecated use setBoardSource() */
export function setIsSampleData(value: boolean): void {
  setBoardSource(value ? 'sample' : 'imported')
}

/** @deprecated use getBoardSource() */
export function getIsSampleData(): boolean {
  return getBoardSource() === 'sample'
}
