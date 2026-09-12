/**
 * The bank closure request letter, ported from `PdfGenerator.kt`.
 *
 * The Android original drew onto an A4 Canvas with the origin at the top-left
 * and y growing downward. pdf-lib puts the origin at the bottom-left, so the
 * layout arithmetic below is kept in the original top-down coordinates and
 * converted once, at the moment of drawing, by `toPdfY`. Keeping the numbers
 * identical makes the two implementations diffable against each other.
 *
 * One deliberate difference: the Android version drew a single page and would
 * run off the bottom if enough overdrafts were selected. This one starts a new
 * page instead.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { LetterSettings, OdAccountWithTransactions } from './types'

const PAGE_WIDTH = 595 // A4 at 72 points per inch
const PAGE_HEIGHT = 842
const MARGIN = 54
const LINE_SPACING = 18
const BODY_SIZE = 12
const ROW_HEIGHT = 24
const COLUMN_WIDTH = (PAGE_WIDTH - 2 * MARGIN) / 2
const RIGHT_EDGE = PAGE_WIDTH - MARGIN
/** Lowest baseline that still leaves a bottom margin; past this, start a page. */
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN

const BLACK = rgb(0, 0, 0)
const GRID = rgb(0.267, 0.267, 0.267) // Android's Color.DKGRAY

export interface ClosureLetterInput {
  settings: LetterSettings
  /** The overdrafts the user ticked on the dashboard. */
  accounts: OdAccountWithTransactions[]
  /** Already formatted for print, e.g. `12 Sep 2026`. */
  date: string
}

/** Renders the letter and returns the raw PDF bytes. */
export async function buildClosureLetterPdf(input: ClosureLetterInput): Promise<Uint8Array> {
  const { settings, accounts, date } = input

  const pdf = await PDFDocument.create()
  pdf.setTitle('Request for closure of OD account')
  pdf.setCreator('OD Tracker')

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = MARGIN // baseline of the next line, measured from the top

  const toPdfY = (topDownY: number) => PAGE_HEIGHT - topDownY

  /** Starts a fresh page and resets to the top margin. */
  function newPage(): void {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = MARGIN
  }

  /** Breaks to a new page when `needed` points would not fit below the cursor. */
  function ensureRoom(needed: number): void {
    if (y + needed > PAGE_BOTTOM) newPage()
  }

  function drawAt(
    text: string,
    x: number,
    baseline: number,
    opts: { bold?: boolean; underline?: boolean; size?: number } = {},
  ): void {
    const size = opts.size ?? BODY_SIZE
    const font = opts.bold ? bold : regular
    page.drawText(text, { x, y: toPdfY(baseline), size, font, color: BLACK })

    if (opts.underline) {
      const width = font.widthOfTextAtSize(text, size)
      page.drawLine({
        start: { x, y: toPdfY(baseline + 2) },
        end: { x: x + width, y: toPdfY(baseline + 2) },
        thickness: 0.75,
        color: BLACK,
      })
    }
  }

  /** Draws one line at the cursor and advances it, like the original `drawLine`. */
  function line(
    text: string,
    opts: { bold?: boolean; rightAlign?: boolean; size?: number } = {},
  ): void {
    ensureRoom(LINE_SPACING)
    const size = opts.size ?? BODY_SIZE
    const font = opts.bold ? bold : regular
    const x = opts.rightAlign ? RIGHT_EDGE - font.widthOfTextAtSize(text, size) : MARGIN
    drawAt(text, x, y, { bold: opts.bold, size })
    y += LINE_SPACING
  }

  /**
   * Lays out a run of differently-styled fragments as one wrapped paragraph,
   * breaking between words exactly where the Android version did.
   */
  function paragraph(parts: readonly { text: string; underline?: boolean }[]): void {
    let x = MARGIN
    ensureRoom(LINE_SPACING)

    for (const part of parts) {
      const words = part.text.split(' ')
      for (let i = 0; i < words.length; i += 1) {
        const word = words[i] + (i < words.length - 1 ? ' ' : '')
        if (word === '') continue

        const width = regular.widthOfTextAtSize(word, BODY_SIZE)
        if (x + width > RIGHT_EDGE) {
          x = MARGIN
          y += LINE_SPACING
          ensureRoom(LINE_SPACING)
        }
        drawAt(word, x, y, { underline: part.underline })
        x += width
      }
    }
    y += LINE_SPACING
  }

  /** One bordered table row: two cells, drawn from the row's top edge. */
  function tableRow(left: string, right: string, opts: { header?: boolean } = {}): void {
    ensureRoom(ROW_HEIGHT)
    const top = y
    const bottom = y + ROW_HEIGHT

    drawAt(left, MARGIN + 12, y + 16, { bold: opts.header })
    drawAt(right, MARGIN + COLUMN_WIDTH + 12, y + 16, { bold: opts.header })

    const border = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({
        start: { x: x1, y: toPdfY(y1) },
        end: { x: x2, y: toPdfY(y2) },
        thickness: 1,
        color: GRID,
      })

    border(MARGIN, top, RIGHT_EDGE, top) // top edge
    border(MARGIN, bottom, RIGHT_EDGE, bottom) // bottom edge
    border(MARGIN, top, MARGIN, bottom) // left edge
    border(RIGHT_EDGE, top, RIGHT_EDGE, bottom) // right edge
    border(MARGIN + COLUMN_WIDTH, top, MARGIN + COLUMN_WIDTH, bottom) // column divider

    y = bottom
  }

  // 1. Addressee
  line('To,')
  line('The Manager')
  line(settings.bank_name)
  line(settings.branch_name)
  line(settings.branch_address)
  y += 10

  // 2. Sender
  line('From,')
  line(settings.full_name)
  line(`CIF No. - ${settings.cif_no}`)
  y += 15

  // 3. Subject
  line('Sub: Request for closure of OD account taken against FD and removal of lien', {
    bold: true,
  })
  line('     on corresponding FD', { bold: true })
  y += 15

  // 4. Salutation
  line('Sir,')
  y += 5

  // 5. Request, with the two operative phrases underlined
  paragraph([
    { text: 'I hereby request you to take necessary actions to ' },
    { text: 'close my OD accounts', underline: true },
    { text: ' mentioned below and ' },
    { text: 'remove the lien', underline: true },
    { text: ' against their linked FD Accounts.' },
  ])
  y += 15

  // 6. The accounts in question
  tableRow('OD Account', 'Linked FD Account', { header: true })
  for (const entry of accounts) {
    tableRow(entry.account.od_number, entry.account.underlying_fd_no)
  }
  y += 20

  // 7. How the bank should settle it
  paragraph([
    {
      text:
        'The closure can be made by debiting the required amount from my Savings Account No. ' +
        `${settings.savings_account_no}.`,
    },
  ])
  y += 25

  // 8. Sign-off. Kept together so a page break cannot strand the signature.
  ensureRoom(LINE_SPACING * 2 + 25 + 35 + LINE_SPACING * 2)
  line('Thanking you', { rightAlign: true })
  y += 25
  line(settings.full_name, { rightAlign: true })
  y += 35

  // 9. Place and date
  line(`PLACE: ${settings.place.toUpperCase()}`, { bold: true })
  line(`DATE: ${date}`, { bold: true })

  return pdf.save()
}

/** Filename the browser suggests, e.g. `Closure_of_OD_2026-09-12.pdf`. */
export function closureLetterFilename(isoDate: string): string {
  return `Closure_of_OD_${isoDate}.pdf`
}

/**
 * Hands the rendered letter to the browser as a download.
 *
 * The object URL is revoked on the next tick rather than immediately, because
 * Safari abandons the download if the blob disappears in the same frame.
 */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
