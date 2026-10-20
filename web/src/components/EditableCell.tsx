import { useRef, useState, type ReactNode } from 'react'
import { cx, useAutoFocus } from './ui'
import { formatDate, formatINR, humanize } from '@/lib/format'

export type CellKind = 'text' | 'number' | 'money' | 'date' | 'select' | 'boolean' | 'textarea'
type Value = string | number | boolean | null

interface Props {
  value: Value
  kind?: CellKind
  options?: readonly string[] | { value: string; label: string }[]
  /** Called with the parsed value; empty input becomes null. */
  onSave: (v: Value) => unknown
  display?: ReactNode
  placeholder?: string
  className?: string
  required?: boolean
  align?: 'left' | 'right'
}

function toInput(v: Value): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function parse(raw: string, kind: CellKind): Value {
  const s = raw.trim()
  if (kind === 'boolean') return s === 'true'
  if (s === '') return null
  if (kind === 'number' || kind === 'money') {
    const n = Number(s.replace(/[₹,\s]/g, ''))
    return Number.isFinite(n) ? n : NaN
  }
  return s
}

function defaultDisplay(v: Value, kind: CellKind, opts?: Props['options']): ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-slate-400">—</span>
  if (kind === 'money') return <span className="num">{formatINR(Number(v))}</span>
  if (kind === 'number') return <span className="num">{String(v)}</span>
  if (kind === 'date') return <span className="whitespace-nowrap">{formatDate(String(v))}</span>
  if (kind === 'boolean') return v ? 'Yes' : 'No'
  if (kind === 'select' && opts) {
    const o = (opts as Array<string | { value: string; label: string }>).find((x) => (typeof x === 'string' ? x : x.value) === v)
    return typeof o === 'object' ? o.label : humanize(String(v))
  }
  return String(v)
}

/**
 * Click to edit; Enter or blur saves, Esc cancels. The parent's mutation is
 * optimistic (see useUpdate), so the new value shows immediately and rolls
 * back if the server rejects it.
 */
export function EditableCell({ value, kind = 'text', options, onSave, display, placeholder, className, required, align }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState(false)
  // A select commits on change; the blur that can follow must not re-save the stale draft.
  const done = useRef(false)

  const start = () => {
    done.current = false
    setDraft(toInput(value))
    setErr(false)
    setEditing(true)
  }
  const cancel = () => {
    done.current = true
    setEditing(false)
  }
  const commit = (raw = draft) => {
    if (done.current) return
    const v = parse(raw, kind)
    if (typeof v === 'number' && Number.isNaN(v)) return setErr(true)
    if (required && (v === null || v === '')) return setErr(true)
    done.current = true
    setEditing(false)
    if (v !== value && !(v === null && (value === null || value === undefined || value === ''))) onSave(v)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          start()
        }}
        title="Click to edit"
        className={cx(
          '-mx-1 min-h-7 w-full rounded px-1 py-0.5 hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 dark:hover:bg-slate-800 dark:hover:ring-slate-700',
          align === 'right' ? 'text-right' : 'text-left',
          className,
        )}
      >
        {display ?? defaultDisplay(value, kind, options)}
      </button>
    )
  }

  const common = {
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      } else if (e.key === 'Enter' && kind !== 'textarea') {
        e.preventDefault()
        commit()
      } else if (e.key === 'Enter' && kind === 'textarea' && (e.metaKey || e.ctrlKey)) {
        commit()
      }
    },
    onBlur: () => commit(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    className: cx('input py-1', err && 'border-red-500 ring-2 ring-red-500/30', align === 'right' && 'text-right'),
  }

  if (kind === 'select' || kind === 'boolean') {
    const opts =
      kind === 'boolean'
        ? [
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ]
        : (options ?? []).map((o) => (typeof o === 'string' ? { value: o, label: humanize(o) } : o))
    return (
      <SelectEditor
        {...common}
        value={kind === 'boolean' ? String(!!value) : draft}
        onChange={(v) => {
          setDraft(v)
          commit(v)
        }}
        options={opts}
        allowEmpty={!required && kind === 'select'}
      />
    )
  }
  if (kind === 'textarea') {
    return <TextareaEditor {...common} value={draft} onChange={setDraft} placeholder={placeholder} />
  }
  return (
    <InputEditor
      {...common}
      type={kind === 'date' ? 'date' : 'text'}
      inputMode={kind === 'number' || kind === 'money' ? 'decimal' : undefined}
      value={draft}
      onChange={setDraft}
      placeholder={placeholder}
    />
  )
}

type EditorBase = {
  onKeyDown: (e: React.KeyboardEvent) => void
  onBlur: () => void
  onClick: (e: React.MouseEvent) => void
  className: string
}

function InputEditor(p: EditorBase & { type: string; inputMode?: 'decimal'; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useAutoFocus<HTMLInputElement>()
  return <input ref={ref} {...p} onChange={(e) => p.onChange(e.target.value)} />
}

function TextareaEditor(p: EditorBase & { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useAutoFocus<HTMLTextAreaElement>()
  return <textarea ref={ref} rows={3} {...p} onChange={(e) => p.onChange(e.target.value)} />
}

function SelectEditor(
  p: EditorBase & { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; allowEmpty: boolean },
) {
  const ref = useAutoFocus<HTMLSelectElement>()
  return (
    <select ref={ref} className={p.className} onKeyDown={p.onKeyDown} onBlur={p.onBlur} onClick={p.onClick} value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      {p.allowEmpty && <option value="">—</option>}
      {p.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
