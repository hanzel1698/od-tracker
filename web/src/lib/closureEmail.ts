export interface ClosureEmailItem {
  odNo: string
  fdNos: string[]
}

export interface ClosureEmailInput {
  to: string
  savingsAccountNo: string
  items: ClosureEmailItem[]
  name: string
  cif: string
}

export const CLOSURE_SUBJECT =
  'Request for closure of OD account taken against FD and removal of lien on corresponding FD'

function fdPhrase(fdNos: string[]): string {
  const fds = fdNos.filter(Boolean)
  if (fds.length === 0) return 'with linked FD No. (not recorded)'
  if (fds.length === 1) return `with linked FD No. ${fds[0]}`
  return `with linked FD Nos. ${fds.slice(0, -1).join(', ')} and ${fds[fds.length - 1]}`
}

export function closureEmailBody(input: ClosureEmailInput): string {
  const list = input.items.map((it, i) => `${i + 1}. OD No. ${it.odNo} ${fdPhrase(it.fdNos)}`).join('\n')
  return [
    'Sir,',
    '',
    `Please close my OD account(s) mentioned below and remove the lien against their linked FD accounts. ` +
      `Kindly debit any remaining amount due on these OD accounts from my savings account no. ${input.savingsAccountNo}.`,
    '',
    list,
    '',
    'Thank you',
    input.name,
    `CIF No. - ${input.cif}`,
  ].join('\n')
}

export function buildClosureEmail(input: ClosureEmailInput) {
  const subject = CLOSURE_SUBJECT
  const body = closureEmailBody(input)
  const mailto =
    `mailto:${encodeURIComponent(input.to)}` +
    `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  const full = `To: ${input.to}\nSubject: ${subject}\n\n${body}`
  return { to: input.to, subject, body, mailto, full }
}

export function followUpEmail(input: ClosureEmailInput & { requestedOn: string }) {
  const subject = `Follow-up: ${CLOSURE_SUBJECT}`
  const body = [
    'Sir,',
    '',
    `I had requested on ${input.requestedOn} the closure of the OD account(s) below and removal of lien on their linked FDs. ` +
      'The closure is yet to be completed. Kindly process the request at the earliest, debiting any remaining amount due ' +
      `from my savings account no. ${input.savingsAccountNo}.`,
    '',
    input.items.map((it, i) => `${i + 1}. OD No. ${it.odNo} ${fdPhrase(it.fdNos)}`).join('\n'),
    '',
    'Thank you',
    input.name,
    `CIF No. - ${input.cif}`,
  ].join('\n')
  const mailto =
    `mailto:${encodeURIComponent(input.to)}` +
    `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return { to: input.to, subject, body, mailto, full: `To: ${input.to}\nSubject: ${subject}\n\n${body}` }
}
