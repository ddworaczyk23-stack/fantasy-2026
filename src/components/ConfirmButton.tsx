import { useState, useRef, useEffect } from 'react'

/**
 * A button that requires a second click to actually fire, for destructive
 * actions. First click swaps the label to a confirmation prompt for a few
 * seconds; clicking again within that window confirms.
 */
export default function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Click again to confirm',
  className = 'btn btn-danger',
  disabled,
  ariaLabel,
}: {
  onConfirm: () => void
  children: React.ReactNode
  confirmLabel?: string
  className?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  function handleClick() {
    if (!armed) {
      setArmed(true)
      timer.current = window.setTimeout(() => setArmed(false), 3000)
      return
    }
    if (timer.current) window.clearTimeout(timer.current)
    setArmed(false)
    onConfirm()
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}
