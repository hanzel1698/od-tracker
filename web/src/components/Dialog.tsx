import { useEffect, useRef, type ReactNode } from 'react'

interface DialogProps {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  /** Rendered in the footer, right-aligned. */
  actions: ReactNode
}

/**
 * A modal that behaves like one: Escape closes it, a backdrop click closes it,
 * focus lands inside on open, and the page behind it does not scroll.
 */
export function Dialog({ title, description, onClose, children, actions }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Land focus on the first control so keyboard users are not stranded
    // behind the backdrop.
    panelRef.current?.querySelector<HTMLElement>('input, select, button')?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="dialog"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        {description && <p className="dialog-description">{description}</p>}
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  )
}
