import { useState, type ReactNode } from 'react'
import { useDelete, useInsert, useUpdate } from '@/data/hooks'
import type { TableName } from '@/lib/types'
import { Button, EmptyState, SkeletonRows, useConfirm } from './ui'
import { EditableCell, type CellKind } from './EditableCell'

export interface Col<T> {
  key: keyof T & string
  label: string
  kind?: CellKind
  options?: readonly string[] | { value: string; label: string }[]
  required?: boolean
  render?: (row: T) => ReactNode
  readOnly?: boolean
}

/** A list where every cell is inline-editable, with an add row and confirmed deletes. */
export function CrudTable<T extends { id: number }>({
  table,
  rows,
  cols,
  loading,
  newRow,
  describe,
  extra,
  onSave,
}: {
  table: TableName
  rows: T[]
  cols: Col<T>[]
  loading?: boolean
  newRow: () => Partial<T>
  describe: (r: T) => string
  extra?: (r: T) => ReactNode
  onSave?: (r: T, key: keyof T, v: unknown) => void
}) {
  const insert = useInsert(table)
  const update = useUpdate(table)
  const del = useDelete(table)
  const confirm = useConfirm()
  const [draft, setDraft] = useState<Record<string, string>>({})

  const required = cols.filter((c) => c.required && !c.readOnly)
  const canAdd = required.every((c) => (draft[c.key] ?? '').trim())

  const add = () => {
    const row: Record<string, unknown> = { ...newRow() }
    for (const c of cols) {
      if (c.readOnly) continue
      const v = (draft[c.key] ?? '').trim()
      if (v === '') continue
      row[c.key] = c.kind === 'number' || c.kind === 'money' ? Number(v) : c.kind === 'boolean' ? v === 'true' : v
    }
    insert.mutate(row as never, { onSuccess: () => setDraft({}) })
  }

  if (loading) return <SkeletonRows />

  return (
    <div className="card -mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            {cols.map((c) => (
              <th key={c.key} className="th">
                {c.label}
              </th>
            ))}
            <th className="th" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <tr key={r.id}>
              {cols.map((c) => (
                <td key={c.key} className="td">
                  {c.readOnly ? (
                    c.render?.(r)
                  ) : (
                    <EditableCell
                      kind={c.kind}
                      options={c.options}
                      required={c.required}
                      value={(r[c.key] as never) ?? null}
                      display={c.render?.(r)}
                      onSave={(v) => (onSave ? onSave(r, c.key, v) : update.mutate({ id: r.id, patch: { [c.key]: v } as never }))}
                    />
                  )}
                </td>
              ))}
              <td className="td whitespace-nowrap text-right">
                {extra?.(r)}
                <button
                  className="px-1 text-slate-400 hover:text-red-600"
                  title="Delete"
                  onClick={async () => (await confirm({ title: `Delete ${describe(r)}?` })) && del.mutate({ id: r.id })}
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={cols.length + 1} className="p-4">
                <EmptyState title="Nothing here yet">Add the first one below.</EmptyState>
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60">
          <tr>
            {cols.map((c) => (
              <td key={c.key} className="td">
                {c.readOnly ? null : c.kind === 'select' || c.kind === 'boolean' ? (
                  <select className="input py-1" value={draft[c.key] ?? ''} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}>
                    <option value="">{c.kind === 'boolean' ? '—' : 'Choose…'}</option>
                    {(c.kind === 'boolean' ? ['true', 'false'] : (c.options ?? [])).map((o) => {
                      const v = typeof o === 'string' ? o : o.value
                      const l = typeof o === 'string' ? (c.kind === 'boolean' ? (o === 'true' ? 'Yes' : 'No') : o) : o.label
                      return (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      )
                    })}
                  </select>
                ) : (
                  <input
                    className="input py-1"
                    type={c.kind === 'date' ? 'date' : 'text'}
                    placeholder={c.label + (c.required ? ' *' : '')}
                    value={draft[c.key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && canAdd && add()}
                  />
                )}
              </td>
            ))}
            <td className="td">
              <Button size="sm" disabled={!canAdd || insert.isPending} onClick={add}>
                Add
              </Button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
