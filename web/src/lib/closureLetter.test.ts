import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildClosureLetterPdf, closureLetterFilename } from './closureLetter'
import type { LetterSettings, OdAccountWithTransactions } from './types'

const settings: LetterSettings = {
  bank_name: 'State Bank of India',
  branch_name: 'Park Street Branch',
  branch_address: 'Kolkata, West Bengal',
  full_name: 'Hanzel Fernandez',
  cif_no: '123456789',
  savings_account_no: '00112233445',
  place: 'Kolkata',
}

function account(odNumber: string, fdNumber: string): OdAccountWithTransactions {
  return {
    account: {
      id: odNumber,
      user_id: 'user-1',
      od_number: odNumber,
      approved_limit: 100_000,
      underlying_fd_no: fdNumber,
      fd_maturity_date: '2027-01-01',
      interest_rate: 7.5,
      status: 'ACTIVE',
      lien_removed: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    transactions: [],
  }
}

describe('buildClosureLetterPdf', () => {
  it('produces a PDF for a single overdraft', async () => {
    const bytes = await buildClosureLetterPdf({
      settings,
      accounts: [account('OD-001', 'FD-001')],
      date: '12 Sep 2026',
    })

    // %PDF- magic number: proof it is a real document, not an empty buffer.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(1_000)
  })

  it('spills onto more pages instead of running off the first one', async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      account(`OD-${String(i).padStart(3, '0')}`, `FD-${String(i).padStart(3, '0')}`),
    )

    const single = await buildClosureLetterPdf({
      settings,
      accounts: [account('OD-001', 'FD-001')],
      date: '12 Sep 2026',
    })
    const spilled = await buildClosureLetterPdf({
      settings,
      accounts: many,
      date: '12 Sep 2026',
    })

    expect(spilled.byteLength).toBeGreaterThan(single.byteLength)
    // A 40-row table cannot fit one A4 page alongside the letter body.
    expect(await countPages(spilled)).toBeGreaterThan(1)
    expect(await countPages(single)).toBe(1)
  })

  it('survives blank settings rather than throwing', async () => {
    const bytes = await buildClosureLetterPdf({
      settings: {
        bank_name: '',
        branch_name: '',
        branch_address: '',
        full_name: '',
        cif_no: '',
        savings_account_no: '',
        place: '',
      },
      accounts: [account('OD-001', 'FD-001')],
      date: '12 Sep 2026',
    })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })
})

describe('closureLetterFilename', () => {
  it('stamps the date into the filename', () => {
    expect(closureLetterFilename('2026-09-12')).toBe('Closure_of_OD_2026-09-12.pdf')
  })
})

/**
 * Reads the document back to count its pages. pdf-lib packs page objects into
 * compressed object streams, so the raw bytes cannot simply be grepped.
 */
async function countPages(bytes: Uint8Array): Promise<number> {
  const loaded = await PDFDocument.load(bytes)
  return loaded.getPageCount()
}
