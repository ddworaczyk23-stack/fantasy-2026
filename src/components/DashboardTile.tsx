import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PanelId, PanelSpan } from '../dashboard/layout'

const SPAN_LABEL: Record<PanelSpan, string> = { 1: 'Narrow', 2: 'Medium', 3: 'Wide' }

export default function DashboardTile({
  id,
  span,
  editMode,
  top,
  left,
  width,
  onCycleSpan,
  onHeightChange,
  children,
}: {
  id: PanelId
  span: PanelSpan
  editMode: boolean
  top: number
  left: string
  width: string
  onCycleSpan: (id: PanelId) => void
  onHeightChange: (id: PanelId, height: number) => void
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Report real rendered height up so the parent can pack tiles Pinterest-
  // style (see DashboardGrid) instead of every tile stretching to match its
  // row-mates or the visual order shifting when a tile's height changes.
  useEffect(() => {
    const el = contentRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? el.offsetHeight
      onHeightChange(id, height)
    })
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const style: CSSProperties = {
    position: 'absolute',
    top,
    left,
    width,
    transform: CSS.Translate.toString(transform),
    // Only top/left animate (repack reflow); width snaps instantly since it
    // only changes on an explicit user click (span cycling), not every repack.
    transition: isDragging ? undefined : `top 150ms ease, left 150ms ease, ${transition ?? ''}`,
  }

  return (
    <div ref={setNodeRef} className={`dashboard-tile${isDragging ? ' dashboard-tile--dragging' : ''}`} style={style}>
      <div ref={contentRef}>
        {editMode && (
          <div className="dashboard-tile__toolbar">
            <button
              type="button"
              className="icon-btn btn-sm dashboard-tile__handle"
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              ⠿
            </button>
            <button
              type="button"
              className="icon-btn btn-sm"
              onClick={() => onCycleSpan(id)}
              aria-label={`Panel width: ${SPAN_LABEL[span]}. Click to change.`}
            >
              {SPAN_LABEL[span]}
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
