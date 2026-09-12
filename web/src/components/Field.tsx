import type { InputHTMLAttributes, ReactNode } from 'react'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  children?: ReactNode
}

/** A labelled input. Pass `children` instead to wrap a select or custom control. */
export function Field({ label, hint, error, children, id, ...inputProps }: FieldProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {children ?? <input id={fieldId} {...inputProps} />}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
