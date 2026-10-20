import { useState } from 'react'
import { useDelete, useEvents, useInsert, useUpdate } from '@/data/hooks'
import { Button, Card, EmptyState, useConfirm } from '@/components/ui'
import { EditableCell } from '@/components/EditableCell'
import { todayISO } from '@/lib/format'
import { EVENT_TYPES, type OdAccount, type OdEvent, type OdEventType } from '@/lib/types'

const DOT: Partial<Record<OdEventType, string>> = {
  opened: 'bg-emerald-500',
  renewed: 'bg-blue-500',
  limit_change: 'bg-violet-500',
  closure_requested: 'bg-amber-500',
  closed: 'bg-slate-500',
  lien_released: 'bg-emerald-600',
  expiry_alert: 'bg-red-500',
}

export function EventTimeline({ od }: { od: OdAccount }) {
  const events = (useEvents().data ?? []).filter((e) => e.od_id === od.id).sort((a, b) => b.event_date.localeCompare(a.event_date) || b.id - a.id)
  const insert = useInsert('od_events')
  const update = useUpdate('od_events')
  const del = useDelete('od_events')
  const confirm = useConfirm()
  const [draft, setDraft] = useState<{ event_date: string; event_type: OdEventType; description: string }>({
    event_date: todayISO(),
    event_type: 'note',
    description: '',
  })
  const save = (e: OdEvent, k: keyof OdEvent) => (v: unknown) => update.mutate({ id: e.id, patch: { [k]: v } as Partial<OdEvent> })

  return (
    <Card title="Timeline">
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
        <input type="date" className="input" value={draft.event_date} onChange={(e) => setDraft({ ...draft, event_date: e.target.value })} />
        <select className="input" value={draft.event_type} onChange={(e) => setDraft({ ...draft, event_type: e.target.value as OdEventType })}>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </select>
        <input className="input col-span-2 sm:col-span-1" placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <Button
          className="col-span-2 sm:col-span-1"
          onClick={() =>
            insert.mutate({ ...draft, od_id: od.id, description: draft.description || null }, { onSuccess: () => setDraft({ ...draft, description: '' }) })
          }
        >
          Add event
        </Button>
      </div>
      {!events.length ? (
        <EmptyState title="No events" />
      ) : (
        <ol className="relative ml-2 border-l border-slate-200 dark:border-slate-800">
          {events.map((e) => (
            <li key={e.id} className="mb-4 ml-4">
              <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${DOT[e.event_type] ?? 'bg-slate-400'}`} />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-[8rem_10rem_1fr_7rem_8rem_auto]">
                <EditableCell kind="date" required value={e.event_date} onSave={save(e, 'event_date')} />
                <EditableCell kind="select" required options={EVENT_TYPES} value={e.event_type} onSave={save(e, 'event_type')} className="font-medium" />
                <div className="col-span-2 sm:col-span-1">
                  <EditableCell value={e.description} onSave={save(e, 'description')} placeholder="Description" />
                </div>
                <EditableCell kind="money" value={e.amount} onSave={save(e, 'amount')} />
                <EditableCell kind="date" value={e.new_expiry} onSave={save(e, 'new_expiry')} display={e.new_expiry ? undefined : <span className="text-slate-400">no new expiry</span>} />
                <button
                  className="justify-self-end px-1 text-slate-400 hover:text-red-600"
                  title="Delete"
                  onClick={async () => (await confirm({ title: 'Delete this event?' })) && del.mutate({ id: e.id })}
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
