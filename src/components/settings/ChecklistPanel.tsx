import { useState } from 'react'
import { DRAFT_DAY_CHECKLIST } from '../../data/sampleLeague'
import Panel from '../Panel'

export default function ChecklistPanel() {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <Panel title="Draft Day Checklist" subtitle={`${checked.size} / ${DRAFT_DAY_CHECKLIST.length} done`}>
      <div className="flex-col">
        {DRAFT_DAY_CHECKLIST.map((item, i) => (
          <label key={i} className="slot-row" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
            <div>
              <div className={checked.has(i) ? 'text-muted' : ''}>{item.text}</div>
              <div className="text-xs text-muted">{item.detail}</div>
            </div>
          </label>
        ))}
      </div>
    </Panel>
  )
}
