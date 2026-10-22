// Renders the closure letter as an A4 PDF, laid out like the hand-made one the
// branch has accepted: Times 14pt, 1in margins, indented body, bordered OD/FD table.
import type { jsPDF as JsPdf } from 'jspdf'
import { closureLetter, justifiedGap, wrapRuns, type ClosureLetterInput, type Run } from './closureLetter'

const PT = { left: 72, indent: 108, right: 523, top: 102, line: 18.75, size: 14, rowH: 27, cellPad: 5 }

export async function closureLetterPdf(input: ClosureLetterInput): Promise<JsPdf> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const L = closureLetter(input)
  const width = PT.right - PT.indent
  doc.setFont('times', 'normal')
  doc.setFontSize(PT.size)
  doc.setLineWidth(0.6)
  doc.setProperties({ title: L.subject, author: input.name })

  let y = PT.top
  const nl = (n = 1) => (y += PT.line * n)

  const paragraph = (runs: Run[], x: number, w: number) => {
    const space = doc.getTextWidth(' ')
    for (const line of wrapRuns(runs, w, (s) => doc.getTextWidth(s))) {
      const gap = justifiedGap(line, w, space)
      let cx = x
      for (const word of line.words) {
        const ww = doc.getTextWidth(word.text)
        doc.text(word.text, cx, y)
        if (word.underline) {
          const end = cx + ww + (word.joinNext && word !== line.words[line.words.length - 1] ? gap : 0)
          doc.line(cx, y + 1.8, end, y + 1.8)
        }
        cx += ww + gap
      }
      nl()
    }
  }

  const block = (label: string, lines: string[]) => {
    doc.text(label, PT.left, y)
    nl()
    for (const l of lines) {
      doc.text(l, PT.indent, y)
      nl()
    }
    nl()
  }

  block('To,', L.to)
  block('From,', L.from)

  doc.text('Sub:', PT.left, y)
  for (const l of doc.splitTextToSize(L.subject, width) as string[]) {
    doc.text(l, PT.indent, y)
    nl()
  }
  nl()

  doc.text('Sir,', PT.left, y)
  nl()
  paragraph(L.request, PT.indent, width)
  nl()

  // OD / linked FD table: two equal columns spanning the body width.
  const colW = width / 2
  const rows = [L.table.head, ...L.table.rows]
  let top = y - PT.size
  for (const row of rows) {
    const cells = row.map((c) => doc.splitTextToSize(c, colW - 2 * PT.cellPad) as string[])
    const h = Math.max(PT.rowH, Math.max(...cells.map((c) => c.length)) * PT.line + (PT.rowH - PT.line))
    cells.forEach((c, i) => {
      const x = PT.indent + i * colW
      doc.rect(x, top, colW, h)
      c.forEach((t, k) => doc.text(t, x + PT.cellPad, top + 19 + k * PT.line))
    })
    top += h
  }
  y = top + PT.size + PT.line
  paragraph(L.debit, PT.indent, width)
  nl()

  doc.text(L.thanks, PT.right, y, { align: 'right' })
  nl(3)
  doc.text(L.signature, PT.right, y, { align: 'right' })
  nl()
  doc.text(`PLACE: ${L.place}`, PT.left, y)
  nl()
  doc.text(`DATE: ${L.date}`, PT.left, y)
  return doc
}
