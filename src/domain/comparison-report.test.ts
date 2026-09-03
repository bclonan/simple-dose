import { describe, expect, it } from 'vitest'
import type { DrugFactContent } from './drug-facts'
import { comparisonExcerpt, comparisonFactPresentation, comparisonRowStatus, createComparisonReportHtml, type ComparisonReportCell, type ComparisonReportInput } from './comparison-report'

const content = (items = ['FDA source wording.']): DrugFactContent => ({
  items, values: [], events: [], priceGroups: [],
  sources: [{ label: 'FDA drug label', url: 'https://example.com/label', retrieved: 'Sep 2, 2026', effective: 'Aug 4, 2026' }],
})
const cell = (drugId: string, value = content()): ComparisonReportCell => ({ drugId, statusLabel: 'Public data', availability: 'available', content: value })
const report = (): ComparisonReportInput => ({
  title: 'Medication comparison', generatedAt: 'September 2, 2026',
  medications: [{ id: 'metformin', name: 'Metformin', brands: ['Glucophage'] }, { id: 'empagliflozin', name: 'Empagliflozin', brands: ['Jardiance'] }],
  rows: [{ id: 'side-effects', factType: 'side-effects', cells: [cell('metformin'), cell('empagliflozin', content(['Other FDA source wording.']))] }],
})
const documentFor = (input: ComparisonReportInput) => new DOMParser().parseFromString(createComparisonReportHtml(input), 'text/html')

describe('comparison report presentation', () => {
  it('describes source differences without inferring safety, equivalence, or treatment ranking', () => {
    expect(comparisonRowStatus([cell('one'), cell('two')])).toMatchObject({ kind: 'matching', label: 'Matching source details' })
    const different = comparisonRowStatus([cell('one'), cell('two', content(['A different source statement.']))])
    expect(different).toMatchObject({ kind: 'different', label: 'Different source details' })
    expect(different.description).toContain('does not mean one medication is better or safer')
    expect(comparisonRowStatus([cell('one')]).kind).toBe('single')
  })
  it('never labels missing or partial data as matching', () => {
    for (const availability of ['partial', 'provider-failed', 'field-absent', 'source-unavailable', 'not-loaded', 'loading', 'demo'] as const) {
      expect(comparisonRowStatus([{ ...cell('one'), availability }, cell('two')]).kind).toBe('incomplete')
    }
    expect(comparisonRowStatus([cell('one', content([])), cell('two', content([]))]).kind).toBe('incomplete')
    expect(comparisonRowStatus([]).kind).toBe('incomplete')
  })
  it('keeps a source-date difference visible even when body text matches', () => {
    const changed = content()
    changed.sources[0]!.effective = 'Aug 26, 2026'
    expect(comparisonRowStatus([cell('one'), cell('two', changed)]).kind).toBe('different')
  })
  it('uses patient-facing labels and limits text without inventing a summary', () => {
    expect(comparisonFactPresentation('interactions').help).toContain('not a check')
    expect(comparisonFactPresentation('pricing').help).toContain('not a patient price')
    expect(comparisonExcerpt('  Original\n FDA  text.  ')).toEqual({ text: 'Original FDA text.', truncated: false })
    const source = 'Original wording from the source with enough text to require an excerpt. '.repeat(12)
    const excerpt = comparisonExcerpt(source, 90)
    expect(excerpt.truncated).toBe(true)
    expect(excerpt.text.endsWith('...')).toBe(true)
    expect(source.startsWith(excerpt.text.slice(0, -3))).toBe(true)
    expect(comparisonExcerpt(source, Number.NaN).text.length).toBeLessThanOrEqual(323)
  })
})

describe('standalone comparison snapshot', () => {
  it('places two medications in columns and retains complete source text separately from print excerpts', () => {
    const input = report()
    const longText = 'Complete original FDA source wording. '.repeat(45)
    input.rows[0]!.cells[0]!.content = content([longText])
    const doc = documentFor(input)
    expect(doc.querySelectorAll('thead th[scope="col"]')).toHaveLength(3)
    expect(doc.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(doc.querySelectorAll('tbody td')).toHaveLength(2)
    expect(doc.querySelector('tbody tr')?.getAttribute('data-comparison')).toBe('different')
    expect(doc.querySelector('tbody th')?.textContent).toContain('Possible side effects')
    expect(doc.querySelector('td details')?.textContent).toContain(longText)
    expect(doc.querySelector('td .excerpt')?.textContent).not.toContain(longText)
    expect(doc.querySelector('td .eyebrow')?.textContent).toBe('Source excerpt, not a clinical summary')
    expect(doc.querySelector('caption')?.textContent).toContain('Printed pages contain excerpts and source links')
    expect(doc.querySelector('style')?.textContent).toContain('@page{size:landscape')
    expect(doc.querySelector('style')?.textContent).toContain('thead{display:table-header-group}')
    expect(doc.querySelector('style')?.textContent).toContain('details{display:none}')
    expect(doc.querySelector('.sources')?.textContent).toContain('Retrieved Sep 2, 2026. Source date Aug 4, 2026')
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://example.com/label')
  })
  it('supports four medication columns and fills missing cells without a false comparison', () => {
    const input = report()
    input.medications.push({ id: 'third', name: 'Third medication' }, { id: 'fourth', name: 'Fourth medication' })
    const doc = documentFor(input)
    expect(doc.querySelectorAll('thead th')).toHaveLength(5)
    expect(doc.querySelectorAll('tbody td')).toHaveLength(4)
    expect(doc.querySelector('td[data-drug-id="fourth"]')?.getAttribute('data-availability')).toBe('not-loaded')
    expect(doc.querySelector('td[data-drug-id="fourth"]')?.textContent).toContain('This fact was not loaded')
    expect(doc.querySelector('.comparison')?.textContent).toBe('Incomplete data')
  })
  it('escapes all API and user text and only permits credential-free HTTPS provenance links', () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>&\'"'
    const input = report()
    input.title = payload
    input.generatedAt = payload
    input.medications[0] = { id: 'metformin', name: payload, brands: [payload] }
    const first = input.rows[0]!.cells[0]!
    first.statusLabel = payload
    first.emptyMessage = payload
    first.availability = 'partial'
    first.notices = [payload]
    first.content = { items: [payload], values: [{ label: payload, value: payload }], events: [{ reaction: payload, reports: payload }], priceGroups: [], sources: [
      { label: payload, url: 'javascript:alert(1)', retrieved: payload, effective: payload, dataset: payload, disclaimer: payload },
      { label: 'Credential URL', url: 'https://user:secret@example.com/private', retrieved: 'Today' },
      { label: 'Safe URL', url: 'https://example.com/?q="<script>', retrieved: 'Today' },
    ] }
    const doc = documentFor(input)
    expect(doc.querySelectorAll('script,img,iframe,object')).toHaveLength(0)
    expect(doc.querySelectorAll('[onerror],[onclick]')).toHaveLength(0)
    expect(doc.querySelector('title')?.textContent).toBe(payload)
    expect(doc.querySelector('h1')?.textContent).toBe(payload)
    expect(doc.querySelector('td details .source-text')?.textContent).toBe(payload)
    expect(doc.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(doc.querySelector('a[href*="secret"]')).toBeNull()
    expect(doc.querySelector('a[rel="noopener noreferrer"]')?.textContent).toBe('Safe URL')
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("default-src 'none'")
  })
  it('retains benchmark dimensions, quote provenance, notices, and every quote without calculating savings', () => {
    const input = report()
    const prices = content([])
    prices.priceGroups = [{ kind: 'nadac-benchmark', label: 'Public acquisition benchmark', notice: 'Not a patient price.', quotes: Array.from({ length: 3 }, (_, index) => ({
      id: `quote-${index}`, label: 'NADAC quote', amount: `$${index + 1}.00`, unitAmount: '$0.100000', dimensions: '500 mg, TABLET, 30 EA', basis: 'prescription', ndc: `1234500000${index}`,
      meaning: 'Not a retail quote.', effective: 'Sep 2, 2026', source: { label: 'CMS Medicaid NADAC', url: 'https://data.medicaid.gov/', retrieved: 'Sep 2, 2026', dataset: 'NADAC September' },
    })) }]
    input.rows = [{ id: 'pricing', factType: 'pricing', cells: [cell('metformin', prices), { drugId: 'empagliflozin', statusLabel: 'Public source failed to load', availability: 'provider-failed', emptyMessage: 'The provider request failed.', notices: ['Retry public data.'] }] }]
    const doc = documentFor(input)
    expect(doc.querySelectorAll('details .quote')).toHaveLength(3)
    expect(doc.querySelector('.price-preview')?.textContent).toContain('500 mg, TABLET, 30 EA')
    expect(doc.querySelectorAll('.price-preview .amount')).toHaveLength(1)
    expect(doc.querySelector('.price-preview')?.textContent).toContain('First of 3 source records. Not a lowest-price selection.')
    expect(doc.querySelector('.excerpt')?.textContent).toContain('Additional text or records are omitted from the printed report.')
    expect(doc.querySelector('.price-preview')?.textContent).toContain('NADAC September')
    expect(doc.querySelector('td[data-availability="provider-failed"]')?.textContent).toContain('The provider request failed.')
    expect(doc.querySelector('td[data-availability="provider-failed"]')?.textContent).toContain('Retry public data.')
    expect(doc.body.textContent).not.toMatch(/cheaper|save \$|best medication/i)
  })
  it('rejects ambiguous identities and too many columns instead of omitting information', () => {
    const duplicate = report()
    duplicate.medications[1]!.id = duplicate.medications[0]!.id
    expect(() => createComparisonReportHtml(duplicate)).toThrow('unique')
    const excess = report()
    excess.medications.push(...['three', 'four', 'five'].map(id => ({ id, name: id })))
    expect(() => createComparisonReportHtml(excess)).toThrow('one to four')
    const unknown = report()
    unknown.rows[0]!.cells[0]!.drugId = 'not-selected'
    expect(() => createComparisonReportHtml(unknown)).toThrow('selected medication')
  })
})
