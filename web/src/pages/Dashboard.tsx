import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccounts, useDeleteAccount, useLetterSettings } from '../lib/queries'
import { useAuth } from '../context/AuthContext'
import {
  currentOutstanding,
  portfolioTotals,
  remainingDays,
  todayIso,
  utilisationRatio,
} from '../lib/domain'
import { formatCurrency, formatCurrencyCompact, formatDate, formatDaysLeft } from '../lib/format'
import { Meter } from '../components/Meter'
import { Dialog } from '../components/Dialog'
import { LetterSettingsDialog } from '../components/LetterSettingsDialog'
import {
  AddIcon,
  CloseIcon,
  DeleteIcon,
  DescriptionIcon,
  EditIcon,
  LogoutIcon,
  PdfIcon,
  SettingsIcon,
} from '../components/Icons'
import type { OdAccountWithTransactions } from '../lib/types'

export function Dashboard() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { data: accounts = [], isLoading, isError, error } = useAccounts()
  const { data: settings } = useLetterSettings()
  const deleteAccount = useDeleteAccount()

  const [tab, setTab] = useState<'ACTIVE' | 'CLOSED'>('ACTIVE')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showSettings, setShowSettings] = useState(false)
  const [missingSettings, setMissingSettings] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<OdAccountWithTransactions | null>(null)
  const [letterError, setLetterError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const active = useMemo(
    () => accounts.filter((entry) => entry.account.status === 'ACTIVE'),
    [accounts],
  )
  const closed = useMemo(
    () => accounts.filter((entry) => entry.account.status === 'CLOSED'),
    [accounts],
  )
  const shown = tab === 'ACTIVE' ? active : closed

  // Portfolio figures cover the active book only, as on Android: a closed
  // overdraft has no limit left to report on.
  const totals = useMemo(() => portfolioTotals(active), [active])

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setLetterError(null)
  }

  async function generateLetter() {
    const chosen = accounts.filter((entry) => selectedIds.has(entry.account.id))
    if (chosen.length === 0) return

    // The letter is unusable without these three, so ask before rendering one.
    if (!settings?.full_name || !settings.cif_no || !settings.savings_account_no) {
      setMissingSettings(true)
      return
    }

    try {
      setLetterError(null)
      setGenerating(true)

      // pdf-lib is a large dependency and most sessions never produce a letter,
      // so it is fetched on demand rather than in the initial bundle.
      const { buildClosureLetterPdf, closureLetterFilename, downloadPdf } = await import(
        '../lib/closureLetter'
      )

      const today = todayIso()
      const bytes = await buildClosureLetterPdf({
        settings,
        accounts: chosen,
        date: formatDate(today),
      })
      downloadPdf(bytes, closureLetterFilename(today))
      exitSelectionMode()
    } catch (caught) {
      setLetterError(
        caught instanceof Error ? caught.message : 'Could not generate the letter.',
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1>OD Tracker</h1>
        <div className="top-bar-actions">
          <button
            type="button"
            className="icon-btn"
            title="Closure letter settings"
            aria-label="Closure letter settings"
            onClick={() => setShowSettings(true)}
          >
            <SettingsIcon size={22} />
          </button>
          <button
            type="button"
            className={selectionMode ? 'icon-btn is-active' : 'icon-btn'}
            title={selectionMode ? 'Cancel selection' : 'Select accounts for a closure letter'}
            aria-label={selectionMode ? 'Cancel selection' : 'Select accounts for a closure letter'}
            aria-pressed={selectionMode}
            onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
          >
            {selectionMode ? <CloseIcon size={22} /> : <DescriptionIcon size={22} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => void signOut()}
          >
            <LogoutIcon size={22} />
          </button>
        </div>
      </header>

      <main className="page">
        {!selectionMode && (
          <section className="card card-primary">
            <h2 className="card-title">Overall portfolio status</h2>
            <div className="metrics">
              <div className="metric-row-inline">
                <div className="metric-label">Total limit</div>
                <div className="metric-value">{formatCurrencyCompact(totals.totalLimit)}</div>
              </div>
              <div className="metric-row-inline">
                <div className="metric-label">Outstanding</div>
                <div className="metric-value is-outstanding">
                  {formatCurrencyCompact(totals.totalOutstanding)}
                </div>
              </div>
              <div className="metric-row-inline">
                <div className="metric-label">Available balance</div>
                <div className="metric-value is-available">
                  {formatCurrencyCompact(totals.totalAvailable)}
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === 'ACTIVE'}
            onClick={() => setTab('ACTIVE')}
          >
            Active ({active.length})
          </button>
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === 'CLOSED'}
            onClick={() => setTab('CLOSED')}
          >
            Closed ({closed.length})
          </button>
        </div>

        {isError && (
          <div className="banner banner-error">
            {error instanceof Error ? error.message : 'Could not load your overdrafts.'}
          </div>
        )}
        {letterError && <div className="banner banner-error">{letterError}</div>}

        {isLoading ? (
          <div className="spinner" role="status" aria-label="Loading" />
        ) : shown.length === 0 ? (
          <p className="empty">
            No {tab === 'ACTIVE' ? 'active' : 'closed'} overdraft accounts yet.
          </p>
        ) : (
          <ul className="od-list">
            {shown.map((entry) => (
              <OdCard
                key={entry.account.id}
                entry={entry}
                selectionMode={selectionMode}
                selected={selectedIds.has(entry.account.id)}
                onToggle={() => toggleSelected(entry.account.id)}
                onOpen={() => navigate(`/od/${entry.account.id}`)}
                onDelete={() => setPendingDelete(entry)}
              />
            ))}
          </ul>
        )}
      </main>

      {selectionMode ? (
        <div className="selection-bar">
          <span className="selection-count">
            {selectedIds.size} {selectedIds.size === 1 ? 'OD' : 'ODs'} selected
          </span>
          <button
            type="button"
            className="btn"
            disabled={selectedIds.size === 0 || generating}
            onClick={() => void generateLetter()}
          >
            <PdfIcon size={20} />
            {generating ? 'Generating…' : 'Generate letter'}
          </button>
        </div>
      ) : (
        <Link className="fab" to="/od/new">
          <AddIcon size={22} />
          Add overdraft
        </Link>
      )}

      {showSettings && <LetterSettingsDialog onClose={() => setShowSettings(false)} />}

      {missingSettings && (
        <Dialog
          title="Missing settings"
          onClose={() => setMissingSettings(false)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-text"
                onClick={() => setMissingSettings(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setMissingSettings(false)
                  setShowSettings(true)
                }}
              >
                Go to settings
              </button>
            </>
          }
        >
          <p>
            Add your full name, CIF number and savings account number in settings before
            generating the closure request letter.
          </p>
        </Dialog>
      )}

      {pendingDelete && (
        <Dialog
          title="Delete this overdraft?"
          onClose={() => setPendingDelete(null)}
          actions={
            <>
              <button type="button" className="btn btn-text" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleteAccount.isPending}
                onClick={() => {
                  deleteAccount.mutate(pendingDelete.account.id, {
                    onSettled: () => setPendingDelete(null),
                  })
                }}
              >
                {deleteAccount.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p>
            OD {pendingDelete.account.od_number} and its{' '}
            {pendingDelete.transactions.length} logged{' '}
            {pendingDelete.transactions.length === 1 ? 'transaction' : 'transactions'} will be
            removed. This cannot be undone.
          </p>
        </Dialog>
      )}
    </div>
  )
}

interface OdCardProps {
  entry: OdAccountWithTransactions
  selectionMode: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}

function OdCard({ entry, selectionMode, selected, onToggle, onOpen, onDelete }: OdCardProps) {
  const { account, transactions } = entry
  const outstanding = currentOutstanding(transactions)
  const ratio = utilisationRatio(account.approved_limit, outstanding)
  const daysLeft = remainingDays(account.fd_maturity_date)

  return (
    <li>
      <div className={selected ? 'od-card is-selected' : 'od-card'}>
        {selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select OD ${account.od_number}`}
          />
        )}

        <button
          type="button"
          className="od-card-body"
          onClick={selectionMode ? onToggle : onOpen}
        >
          <span className="od-card-head">
            <span className="od-number">OD: {account.od_number}</span>
            <span className="od-meta">Interest: {account.interest_rate}%</span>
          </span>
          <span className="od-meta">Linked FD: {account.underlying_fd_no}</span>

          <Meter ratio={ratio} />

          <span className="od-row">
            <span className="is-outstanding">Outstanding: {formatCurrency(outstanding)}</span>
            <span>Limit: {formatCurrency(account.approved_limit)}</span>
          </span>
          <span className="od-row">
            <span className="od-meta">Maturity: {formatDate(account.fd_maturity_date)}</span>
            <span className={daysLeft < 30 ? 'is-urgent' : ''}>{formatDaysLeft(daysLeft)}</span>
          </span>
        </button>

        {!selectionMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Link
              className="icon-btn icon-btn-sm"
              to={`/od/${account.id}/edit`}
              title="Edit"
              aria-label={`Edit OD ${account.od_number}`}
            >
              <EditIcon size={18} />
            </Link>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              title="Delete"
              aria-label={`Delete OD ${account.od_number}`}
              onClick={onDelete}
            >
              <DeleteIcon size={18} />
            </button>
          </div>
        )}
      </div>
    </li>
  )
}
