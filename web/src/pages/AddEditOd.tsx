import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAccount, useCreateAccount, useUpdateAccount } from '../lib/queries'
import { Field } from '../components/Field'
import { BackIcon } from '../components/Icons'
import type { OdAccountInput, OdStatus } from '../lib/types'

/** Form state is all strings; numbers are parsed once, on submit. */
interface FormState {
  odNumber: string
  approvedLimit: string
  underlyingFdNo: string
  interestRate: string
  maturityDate: string
  status: OdStatus
  lienRemoved: boolean
}

const EMPTY_FORM: FormState = {
  odNumber: '',
  approvedLimit: '',
  underlyingFdNo: '',
  interestRate: '',
  maturityDate: '',
  status: 'ACTIVE',
  lienRemoved: false,
}

export function AddEditOd() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const { data: existing, isLoading } = useAccount(id)
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitted, setSubmitted] = useState(false)

  // Populate once the account being edited arrives.
  useEffect(() => {
    if (!existing) return
    const { account } = existing
    setForm({
      odNumber: account.od_number,
      approvedLimit: String(account.approved_limit),
      underlyingFdNo: account.underlying_fd_no,
      interestRate: String(account.interest_rate),
      maturityDate: account.fd_maturity_date,
      status: account.status,
      lienRemoved: account.lien_removed,
    })
  }, [existing])

  const limit = Number(form.approvedLimit)
  const rate = Number(form.interestRate)

  const errors = {
    odNumber: form.odNumber.trim() === '' ? 'Required.' : undefined,
    underlyingFdNo: form.underlyingFdNo.trim() === '' ? 'Required.' : undefined,
    approvedLimit:
      form.approvedLimit.trim() === '' || !Number.isFinite(limit) || limit < 0
        ? 'Enter an amount.'
        : undefined,
    interestRate:
      form.interestRate.trim() === '' || !Number.isFinite(rate) || rate < 0
        ? 'Enter a rate.'
        : undefined,
    maturityDate: form.maturityDate === '' ? 'Pick a date.' : undefined,
  }
  const isValid = Object.values(errors).every((message) => message === undefined)

  const pending = createAccount.isPending || updateAccount.isPending
  const failure = createAccount.error ?? updateAccount.error

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!isValid) return

    const input: OdAccountInput = {
      od_number: form.odNumber.trim(),
      approved_limit: limit,
      underlying_fd_no: form.underlyingFdNo.trim(),
      fd_maturity_date: form.maturityDate,
      interest_rate: rate,
      status: form.status,
      lien_removed: form.lienRemoved,
    }

    const onSuccess = () => navigate(isEditing ? `/od/${id}` : '/')

    if (isEditing && id) {
      updateAccount.mutate({ id, input }, { onSuccess })
    } else {
      createAccount.mutate(input, { onSuccess })
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  // Only surface validation messages once the user has tried to submit.
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)

  return (
    <div className="app-shell">
      <header className="top-bar">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          <BackIcon size={22} />
        </button>
        <h1>{isEditing ? 'Edit overdraft' : 'Add overdraft'}</h1>
      </header>

      <main className="page">
        {isEditing && isLoading ? (
          <div className="spinner" role="status" aria-label="Loading" />
        ) : (
          <form className="form" onSubmit={onSubmit}>
            <Field
              label="OD account number"
              value={form.odNumber}
              error={show('odNumber')}
              onChange={(event) => set('odNumber', event.target.value)}
            />
            <Field
              label="Approved OD limit (₹)"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.approvedLimit}
              error={show('approvedLimit')}
              onChange={(event) => set('approvedLimit', event.target.value)}
            />
            <Field
              label="Underlying FD number"
              value={form.underlyingFdNo}
              error={show('underlyingFdNo')}
              onChange={(event) => set('underlyingFdNo', event.target.value)}
            />
            <Field
              label="Interest rate %"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.001"
              value={form.interestRate}
              error={show('interestRate')}
              onChange={(event) => set('interestRate', event.target.value)}
            />
            <Field
              label="FD maturity date"
              type="date"
              value={form.maturityDate}
              error={show('maturityDate')}
              onChange={(event) => set('maturityDate', event.target.value)}
            />

            <Field label="Status">
              <select
                id="field-status"
                value={form.status}
                onChange={(event) => set('status', event.target.value as OdStatus)}
              >
                <option value="ACTIVE">Active</option>
                <option value="CLOSED">Closed</option>
              </select>
            </Field>

            <div className="switch-row">
              <label htmlFor="lien-removed">Lien on FD removed</label>
              <input
                id="lien-removed"
                type="checkbox"
                checked={form.lienRemoved}
                onChange={(event) => set('lienRemoved', event.target.checked)}
              />
            </div>

            {failure && (
              <div className="banner banner-error">
                {failure instanceof Error ? failure.message : 'Could not save the overdraft.'}
              </div>
            )}

            <button className="btn btn-block" type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEditing ? 'Save changes' : 'Add overdraft'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
