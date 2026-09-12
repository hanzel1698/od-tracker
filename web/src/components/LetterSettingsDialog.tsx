import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import { Field } from './Field'
import { useLetterSettings, useSaveLetterSettings } from '../lib/queries'
import { EMPTY_LETTER_SETTINGS, type LetterSettings } from '../lib/types'

/**
 * Sender and bank details for the closure letter. The Android app kept these in
 * SharedPreferences; here they live in `letter_settings` so they follow the user
 * to whichever device they sign in on.
 */
export function LetterSettingsDialog({ onClose }: { onClose: () => void }) {
  const { data } = useLetterSettings()
  const save = useSaveLetterSettings()
  const [form, setForm] = useState<LetterSettings>(data ?? EMPTY_LETTER_SETTINGS)

  // The query may resolve after the dialog has already opened.
  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const set = (key: keyof LetterSettings) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <Dialog
      title="Closure letter settings"
      description="Used to fill in the closure request letter. Saved to your account, so it is there on every device."
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-text" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={save.isPending}
            onClick={() => {
              save.mutate(form, { onSuccess: onClose })
            }}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="Your full name" value={form.full_name} onChange={set('full_name')} />
        <Field label="CIF No." value={form.cif_no} onChange={set('cif_no')} />
        <Field
          label="Savings account no. (for debit)"
          value={form.savings_account_no}
          onChange={set('savings_account_no')}
        />
        <Field label="Bank name" value={form.bank_name} onChange={set('bank_name')} />
        <Field label="Branch name" value={form.branch_name} onChange={set('branch_name')} />
        <Field
          label="Branch city / address"
          value={form.branch_address}
          onChange={set('branch_address')}
        />
        <Field label="Place (city, state)" value={form.place} onChange={set('place')} />

        {save.isError && (
          <div className="banner banner-error">
            {save.error instanceof Error ? save.error.message : 'Could not save settings.'}
          </div>
        )}
      </div>
    </Dialog>
  )
}
