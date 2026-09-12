import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAccount, useCreateTransaction, useDeleteTransaction } from '../lib/queries'
import { currentOutstanding, availableLimit, remainingDays, todayIso, utilisationRatio } from '../lib/domain'
import { formatCurrency, formatDate } from '../lib/format'
import { Meter } from '../components/Meter'
import { Dialog } from '../components/Dialog'
import { Field } from '../components/Field'
import { AddIcon, BackIcon, DeleteIcon, EditIcon, PercentIcon, RemoveIcon } from '../components/Icons'
import type { OdTransaction, TransactionType } from '../lib/types'

const TYPE_LABELS: Record<TransactionType, string> = {
  WITHDRAWAL: 'Withdrawal',
  REPAYMENT: 'Repayment',
  INTEREST: 'Interest debit',
}

const DIALOG_TITLES: Record<TransactionType, string> = {
  WITHDRAWAL: 'Withdraw funds',
  REPAYMENT: 'Repay funds',
  INTEREST: 'Interest debit',
}

export function OdDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useAccount(id)
  const deleteTransaction = useDeleteTransaction()

  const [txType, setTxType] = useState<TransactionType | null>(null)

  if (isLoading) {
    return (
      <div className="app-shell">
        <DetailBar onBack={() => navigate('/')} />
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="app-shell">
        <DetailBar onBack={() => navigate('/')} />
        <main className="page">
          <div className="banner banner-error">
            {error instanceof Error ? error.message : 'That overdraft could not be found.'}
          </div>
        </main>
      </div>
    )
  }

  const { account, transactions } = data
  const outstanding = currentOutstanding(transactions)
  const available = availableLimit(account.approved_limit, outstanding)
  const ratio = utilisationRatio(account.approved_limit, outstanding)
  const daysLeft = remainingDays(account.fd_maturity_date)

  return (
    <div className="app-shell">
      <DetailBar onBack={() => navigate('/')} editHref={`/od/${account.id}/edit`} />

      <main className="page">
        <section className="card card-flat">
          <div className="detail-row">
            <h2 className="card-title" style={{ marginBottom: 0 }}>
              Limit utilisation
            </h2>
            <strong>{Math.round(ratio * 100)}% used</strong>
          </div>

          <Meter ratio={ratio} large />

          <div className="detail-row" style={{ marginTop: 12 }}>
            <div>
              <div className="metric-label">Outstanding</div>
              <div className="metric-value is-outstanding">{formatCurrency(outstanding)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="metric-label">Available balance</div>
              <div className="metric-value is-available">{formatCurrency(available)}</div>
            </div>
          </div>
        </section>

        <section className="card">
          <dl className="detail-rows">
            <Row label="OD account no." value={account.od_number} />
            <Row label="Linked FD no." value={account.underlying_fd_no} />
            <Row label="Approved limit" value={formatCurrency(account.approved_limit)} />
            <Row label="Interest rate" value={`${account.interest_rate}%`} />
            <Row label="Maturity date" value={formatDate(account.fd_maturity_date)} />
            <Row
              label="Days to maturity"
              value={daysLeft === 0 ? 'Matured' : `${daysLeft} days`}
            />

            <div className="detail-row">
              <dt>Status</dt>
              <dd>
                <span className={account.status === 'ACTIVE' ? 'chip chip-success' : 'chip chip-error'}>
                  {account.status}
                </span>
              </dd>
            </div>

            <div className="detail-row">
              <dt>Lien on FD</dt>
              <dd>
                <span className={account.lien_removed ? 'chip chip-success' : 'chip chip-warning'}>
                  {account.lien_removed ? 'Lien removed' : 'Lien active'}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <h2 className="section-title">Log funds transfer</h2>
        <div className="action-row">
          <button type="button" className="btn btn-danger" onClick={() => setTxType('WITHDRAWAL')}>
            <RemoveIcon size={18} />
            Withdraw
          </button>
          <button type="button" className="btn btn-success" onClick={() => setTxType('REPAYMENT')}>
            <AddIcon size={18} />
            Repay
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setTxType('INTEREST')}>
            <PercentIcon size={18} />
            Interest
          </button>
        </div>

        <h2 className="section-title">Transaction history</h2>
        {transactions.length === 0 ? (
          <p className="empty">No transactions logged yet.</p>
        ) : (
          <ul className="tx-list">
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                onDelete={() => deleteTransaction.mutate(tx.id)}
              />
            ))}
          </ul>
        )}
      </main>

      {txType && id && (
        <AddTransactionDialog
          odId={id}
          type={txType}
          onClose={() => setTxType(null)}
        />
      )}
    </div>
  )
}

function DetailBar({ onBack, editHref }: { onBack: () => void; editHref?: string }) {
  return (
    <header className="top-bar">
      <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
        <BackIcon size={22} />
      </button>
      <h1>Overdraft details</h1>
      {editHref && (
        <Link className="icon-btn" to={editHref} aria-label="Edit overdraft" title="Edit">
          <EditIcon size={22} />
        </Link>
      )}
    </header>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function TransactionRow({
  transaction,
  onDelete,
}: {
  transaction: OdTransaction
  onDelete: () => void
}) {
  // Withdrawals and interest debits add to what is owed, so both read as a
  // minus against the account holder, exactly as on Android.
  const isDebit = transaction.type === 'WITHDRAWAL' || transaction.type === 'INTEREST'
  const typeClass =
    transaction.type === 'WITHDRAWAL'
      ? 'is-withdrawal'
      : transaction.type === 'REPAYMENT'
        ? 'is-repayment'
        : 'is-interest'

  return (
    <li className="tx-item">
      <div style={{ minWidth: 0 }}>
        <div className={`tx-type ${typeClass}`}>{TYPE_LABELS[transaction.type]}</div>
        <div className="tx-note">{formatDate(transaction.date)}</div>
        {transaction.notes && <div className="tx-note">{transaction.notes}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className={`tx-amount ${typeClass}`}>
          {isDebit ? '−' : '+'} {formatCurrency(transaction.amount)}
        </span>
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          onClick={onDelete}
          aria-label="Delete transaction"
          title="Delete"
        >
          <DeleteIcon size={16} />
        </button>
      </div>
    </li>
  )
}

function AddTransactionDialog({
  odId,
  type,
  onClose,
}: {
  odId: string
  type: TransactionType
  onClose: () => void
}) {
  const createTransaction = useCreateTransaction()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [notes, setNotes] = useState('')

  const parsedAmount = Number(amount)
  const isValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0

  return (
    <Dialog
      title={DIALOG_TITLES[type]}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-text" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={!isValid || createTransaction.isPending}
            onClick={() => {
              createTransaction.mutate(
                { od_id: odId, type, amount: parsedAmount, date, notes: notes.trim() },
                { onSuccess: onClose },
              )
            }}
          >
            {createTransaction.isPending ? 'Adding…' : 'Add'}
          </button>
        </>
      }
    >
      <div className="form">
        <Field
          label="Amount (₹)"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <Field
          label="Transaction date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <Field
          label="Description / notes (optional)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        {createTransaction.isError && (
          <div className="banner banner-error">
            {createTransaction.error instanceof Error
              ? createTransaction.error.message
              : 'Could not add the transaction.'}
          </div>
        )}
      </div>
    </Dialog>
  )
}
