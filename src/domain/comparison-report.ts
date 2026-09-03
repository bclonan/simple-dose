import type { FactAvailability } from './drug-fact-status'
import { drugFactRegistry, drugFactTypes, hasFactContent, type DrugFactContent, type DrugFactSource, type DrugFactType } from './drug-facts'

export interface ComparisonReportMedication { id: string; name: string; brands?: string[] }
export interface ComparisonReportCell {
  drugId: string
  statusLabel: string
  availability: FactAvailability
  content?: DrugFactContent
  emptyMessage?: string
  notices?: string[]
}
export interface ComparisonReportRow { id: string; factType: DrugFactType; cells: ComparisonReportCell[] }
export interface ComparisonReportInput {
  title: string
  generatedAt: string
  medications: ComparisonReportMedication[]
  rows: ComparisonReportRow[]
}
export interface ComparisonRowStatus {
  kind: 'matching' | 'different' | 'incomplete' | 'single'
  label: string
  description: string
}

const factPresentation: Record<DrugFactType, { label: string; help: string }> = {
  identity: { label: 'Medication details', help: 'Check the generic name, brand names, and product identifiers.' },
  uses: { label: 'What it is used for', help: 'Uses described in each medication\'s FDA label.' },
  ingredients: { label: 'Active ingredients', help: 'Shared ingredients do not establish that medications or doses are interchangeable.' },
  strengths: { label: 'Strengths and forms', help: 'Product strengths and forms, not instructions for choosing or changing a dose.' },
  'side-effects': { label: 'Possible side effects', help: 'Each FDA label\'s adverse-reaction section. Different wording does not tell you which medication is safer.' },
  warnings: { label: 'Warnings to review', help: 'Label warnings and conditions when the medication should not be used.' },
  'boxed-warnings': { label: 'Boxed warnings', help: 'Boxed warning text from each FDA label. Missing text is not a safety finding.' },
  interactions: { label: 'FDA-labeled interactions', help: 'Each medication\'s label section, not a check of whether these medications interact with each other.' },
  pricing: { label: 'Prices and public benchmarks', help: 'Check the product, quantity, date, and price type. NADAC is a pharmacy acquisition benchmark, not a patient price.' },
  'clinical-pharmacology': { label: 'How it works', help: 'Clinical pharmacology text from the FDA label. The source wording may be technical.' },
  pregnancy: { label: 'Pregnancy information', help: 'Label information to discuss with a clinician. Missing information does not establish safety.' },
  pediatric: { label: 'Use in children', help: 'Pediatric-use information from each FDA label, not a dosing recommendation.' },
  geriatric: { label: 'Use in older adults', help: 'Geriatric-use information from each FDA label.' },
  'adverse-events': { label: 'Reported adverse events', help: 'Reports do not prove a medication caused an event. Counts cannot be used to compare medication safety.' },
}

export const comparisonFactPresentation = (factType: DrugFactType) => factPresentation[factType]

/** Compare the displayed source data exactly, including its provenance. This is not a clinical comparison. */
export function comparisonRowStatus(cells: readonly ComparisonReportCell[]): ComparisonRowStatus {
  if (!cells.length || cells.some(cell => cell.availability !== 'available' || !cell.content || !hasFactContent(cell.content))) {
    return { kind: 'incomplete', label: 'Incomplete data', description: 'At least one medication has missing, loading, or partial source data. Do not treat missing information as an absent risk.' }
  }
  if (cells.length < 2) return { kind: 'single', label: 'One medication', description: 'Add another medication to compare source details.' }
  const first = JSON.stringify(cells[0]!.content)
  const matching = cells.every(cell => JSON.stringify(cell.content) === first)
  return matching
    ? { kind: 'matching', label: 'Matching source details', description: 'The loaded source details match exactly. This does not establish equal effectiveness, safety, or interchangeable doses.' }
    : { kind: 'different', label: 'Different source details', description: 'The loaded text, values, or source metadata differ. This does not mean one medication is better or safer.' }
}

/** Excerpts are mechanical cuts of source text, never generated clinical summaries. */
export function comparisonExcerpt(value: string, maxLength = 320): { text: string; truncated: boolean } {
  const text = value.replace(/\s+/g, ' ').trim()
  const limit = Number.isFinite(maxLength) ? Math.min(1200, Math.max(40, Math.floor(maxLength))) : 320
  if (text.length <= limit) return { text, truncated: false }
  const cut = text.slice(0, limit)
  const boundary = cut.lastIndexOf(' ')
  return { text: `${cut.slice(0, boundary > limit * 0.6 ? boundary : limit).trimEnd()}...`, truncated: true }
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const paragraph = (value: string, className = '') => `<p${className ? ` class="${className}"` : ''}>${escapeHtml(value)}</p>`
function sourceLink(source: DrugFactSource): string {
  let url: string | undefined
  try {
    const parsed = new URL(source.url ?? '')
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed.href
  } catch { /* Unavailable or unsafe links remain plain text. */ }
  return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>` : escapeHtml(source.label)
}
function renderSource(source: DrugFactSource): string {
  return `<li>${sourceLink(source)}${paragraph(`Retrieved ${source.retrieved}${source.effective ? `. Source date ${source.effective}` : ''}`, 'source-meta')}${source.dataset ? paragraph(`Dataset: ${source.dataset}`, 'source-meta') : ''}${source.disclaimer ? paragraph(source.disclaimer, 'source-meta') : ''}</li>`
}
function renderSources(sources: DrugFactSource[]): string {
  return sources.length
    ? `<div class="sources"><h4>Sources and dates</h4><ul>${sources.map(renderSource).join('')}</ul></div>`
    : paragraph('Source metadata is unavailable for this fact.', 'source-meta')
}
function renderCompleteContent(content: DrugFactContent): string {
  return `${content.items.map(item => paragraph(item, 'source-text')).join('')}${content.values.length ? `<dl>${content.values.map(value => `<dt>${escapeHtml(value.label)}</dt><dd class="source-text">${escapeHtml(value.value)}</dd>`).join('')}</dl>` : ''}${content.priceGroups.map(group => `<section class="price-group"><h4>${escapeHtml(group.label)}</h4>${paragraph(group.notice, 'notice')}${group.quotes.map(quote => `<div class="quote"><strong>${escapeHtml(quote.amount)}</strong>${paragraph(quote.label)}${paragraph(quote.dimensions)}${paragraph(`Basis: ${quote.basis}${quote.unitAmount ? `. Unit amount: ${quote.unitAmount}` : ''}`)}${quote.ndc ? paragraph(`NDC: ${quote.ndc}`) : ''}${quote.plan ? paragraph(`Plan: ${quote.plan}`) : ''}${paragraph(quote.meaning, 'notice')}${paragraph(`Price date: ${quote.effective}`, 'source-meta')}<ul class="sources">${renderSource(quote.source)}</ul></div>`).join('')}</section>`).join('')}${content.events.length ? `<ul>${content.events.map(event => `<li>${escapeHtml(event.reaction)}: ${escapeHtml(event.reports)} reports</li>`).join('')}</ul>` : ''}`
}
function renderExcerpt(content: DrugFactContent): string {
  const text = [
    ...content.items,
    ...content.values.map(value => `${value.label}: ${value.value}`),
    ...content.events.map(event => `${event.reaction}: ${event.reports} reports`),
  ].join(' ')
  const excerpt = text ? paragraph(comparisonExcerpt(text, 480).text, 'source-text') : ''
  const prices = content.priceGroups.map(group => `<div class="price-preview"><strong>${escapeHtml(group.label)}</strong>${paragraph(group.notice, 'notice')}${group.quotes.length > 1 ? paragraph(`First of ${group.quotes.length} source records. Not a lowest-price selection.`, 'source-meta') : ''}${group.quotes.slice(0, 1).map(quote => `${paragraph(`${quote.amount}${quote.unitAmount ? `, ${quote.unitAmount} per unit` : ''}`, 'amount')}${paragraph(quote.dimensions)}${paragraph(`Basis: ${quote.basis}${quote.ndc ? `. NDC: ${quote.ndc}` : ''}`)}${paragraph(quote.meaning, 'notice')}${paragraph(`Price date: ${quote.effective}`, 'source-meta')}<ul class="sources">${renderSource(quote.source)}</ul>`).join('')}</div>`).join('')
  const omitted = Boolean(text && comparisonExcerpt(text, 480).truncated) || content.priceGroups.some(group => group.quotes.length > 1)
  return `<div class="excerpt"><span class="eyebrow">Source excerpt, not a clinical summary</span>${excerpt}${prices}${omitted ? paragraph('Excerpt only. Additional text or records are omitted from the printed report. Read the source for the full information.', 'notice') : ''}</div>`
}
function renderCell(cell: ComparisonReportCell): string {
  const hasContent = Boolean(cell.content && hasFactContent(cell.content))
  const incomplete = cell.availability !== 'available' || !hasContent
  return `<td data-drug-id="${escapeHtml(cell.drugId)}" data-availability="${escapeHtml(cell.availability)}"${incomplete ? ' class="incomplete"' : ''}><p class="status">${escapeHtml(cell.statusLabel)}</p>${incomplete ? paragraph(cell.emptyMessage || 'This source detail is not fully available. Missing information does not establish the absence of a risk.', 'notice') : ''}${hasContent && cell.content ? `${renderExcerpt(cell.content)}<details><summary>Full selected source details</summary>${renderCompleteContent(cell.content)}</details>${renderSources(cell.content.sources)}` : ''}${cell.notices?.length ? `<div class="source-notices notice"><h4>Source notices</h4><ul>${cell.notices.map(notice => `<li>${escapeHtml(notice)}</li>`).join('')}</ul></div>` : ''}</td>`
}

/** Standalone local snapshot. No scripts, remote fonts, images, or provider requests are included. */
export function createComparisonReportHtml(report: ComparisonReportInput): string {
  if (report.medications.length < 1 || report.medications.length > 4) throw new Error('A comparison report needs one to four medications.')
  if (report.rows.length > drugFactTypes.length) throw new Error('A comparison report has too many fact rows.')
  const medicationIds = new Set(report.medications.map(medication => medication.id))
  if (medicationIds.size !== report.medications.length) throw new Error('Comparison medication IDs must be unique.')
  const rows = report.rows.map(row => {
    if (!drugFactTypes.includes(row.factType)) throw new Error('Unknown comparison fact type.')
    const cellIds = new Set(row.cells.map(cell => cell.drugId))
    if (cellIds.size !== row.cells.length || row.cells.some(cell => !medicationIds.has(cell.drugId))) throw new Error('Comparison cells must use unique selected medication IDs.')
    const cells = report.medications.map(medication => row.cells.find(cell => cell.drugId === medication.id) ?? {
      drugId: medication.id, statusLabel: 'Not loaded', availability: 'not-loaded' as const,
      emptyMessage: 'This fact was not loaded for this medication. Missing information does not establish the absence of a risk.',
    })
    const presentation = comparisonFactPresentation(row.factType)
    const status = comparisonRowStatus(cells)
    return `<tr data-fact-type="${escapeHtml(row.factType)}" data-comparison="${status.kind}"><th scope="row"><h3>${escapeHtml(presentation.label)}</h3>${paragraph(presentation.help, 'help')}<span class="comparison ${status.kind}">${escapeHtml(status.label)}</span>${paragraph(status.description, 'source-meta')}${drugFactRegistry[row.factType].notice ? paragraph(drugFactRegistry[row.factType].notice!, 'notice') : ''}</th>${cells.map(renderCell).join('')}</tr>`
  }).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(report.title)}</title><style>
tbody tr[data-comparison="different"]>td{background:#f6f9ff}tbody tr[data-comparison="different"]>th{box-shadow:inset 3px 0 #7fa7cf}@media print{tr{break-inside:avoid}footer{break-inside:avoid}}
@media print{html body{line-height:1.35}main p{margin:4px 0}main h1{margin:4px 0 6px;font-size:22px}main h3,main h4{margin:0 0 4px}main caption{padding:7px 9px;font-size:9px}main .safety{padding:7px 9px;margin:10px 0}main .excerpt{margin:6px 0}main .status{margin:0 0 6px}main .sources{margin-top:7px}main .sources li{margin:4px 0}main .source-notices{margin-top:7px}main .source-notices ul{padding-left:12px;margin:4px 0}main th,main td{padding:7px}main footer{margin-top:10px}}
*{box-sizing:border-box}body{margin:0;background:#f4f7fa;color:#173047;font:15px/1.55 system-ui,sans-serif}main{max-width:1600px;margin:auto;padding:40px 28px}h1{font-size:32px;line-height:1.2;margin:8px 0 12px}h2{font-size:20px}h3,h4{margin:0 0 8px;font-size:16px}p{margin:8px 0}a{color:#075e72;overflow-wrap:anywhere}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#526677}.intro{max-width:950px}.safety{padding:16px 20px;background:#eaf0f5;border-left:4px solid #647d91;margin:24px 0}.table-wrap{overflow-x:auto;background:white;border:1px solid #cbd8e3;border-radius:12px}table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:760px}caption{text-align:left;padding:18px 20px;font-size:14px;color:#526677}th,td{text-align:left;vertical-align:top;padding:20px;border-top:1px solid #cbd8e3;border-right:1px solid #dce4eb;overflow-wrap:anywhere}thead th{background:#eaf1f5;font-size:19px}thead th:first-child{width:19%}th:last-child,td:last-child{border-right:0}tbody th{background:#f6f8fa;font-weight:400}.brand,.help,.source-meta{font-size:12px;color:#526677}.brand{font-weight:400}.status{font-weight:650;font-size:12px;margin:0 0 14px}.comparison{display:inline-block;font-size:11px;font-weight:650;padding:4px 8px;border-radius:4px;background:#e5edf4}.comparison.different{background:#e6ecfb;color:#324f7b}.comparison.incomplete,.incomplete .status{background:#fff0d5;color:#76551a}.incomplete .status{padding:7px}.notice{font-size:12px;color:#4e606f}.excerpt{margin:12px 0}.source-text{white-space:pre-wrap;font-size:13px}.amount{font-size:20px;font-weight:700}.price-preview+.price-preview,.quote+.quote{border-top:1px solid #dce4eb;padding-top:12px;margin-top:12px}.sources{font-size:12px;margin-top:16px}.sources ul,.sources{padding-left:0;list-style:none}.sources li{margin:10px 0}details{border-top:1px solid #dce4eb;margin-top:16px;padding-top:10px}summary{cursor:pointer;font-weight:650;font-size:12px;color:#075e72}details dl{font-size:13px}dt{font-weight:650;margin-top:12px}dd{margin:4px 0}footer{font-size:12px;color:#526677;margin-top:24px}@page{size:landscape;margin:12mm}@media print{body{background:white;font-size:10px}main{max-width:none;padding:0}h1{font-size:24px}.table-wrap{overflow:visible;border-radius:0}table{min-width:0}thead{display:table-header-group}thead th{font-size:14px}th,td{padding:10px}.source-text{font-size:10px}.brand,.help,.notice,.source-meta,.sources,.status{font-size:9px}.comparison,.eyebrow{font-size:8px}.amount{font-size:15px}h3,h4{font-size:12px}details{display:none}a{color:inherit;text-decoration:underline}a[href]::after{content:' [' attr(href) ']';font-size:8px;word-break:break-all}.safety{padding:10px 12px;margin:16px 0}.quote,.price-preview{break-inside:avoid}footer{font-size:9px}}
</style></head><body><main><header><span class="eyebrow">ClearDose comparison report</span><h1>${escapeHtml(report.title)}</h1>${paragraph(`Snapshot created ${report.generatedAt}`, 'source-meta')}${paragraph('Read each topic across the medication columns. Highlights describe differences in the loaded source details, not which medication is better.', 'intro')}</header><aside class="safety">This report is for discussion with a pharmacist or clinician. It does not recommend a treatment, establish medication safety, or check all interactions. Do not start, stop, or change a medication based on this report.</aside><div class="table-wrap"><table><caption>Selected facts for ${report.medications.length} ${report.medications.length === 1 ? 'medication' : 'medications'}. Excerpts are shortened source text. Open full selected source details in this HTML file to read the complete loaded text. Printed pages contain excerpts and source links.</caption><thead><tr><th scope="col">Comparison topic</th>${report.medications.map(medication => `<th scope="col" data-medication-id="${escapeHtml(medication.id)}">${escapeHtml(medication.name)}${medication.brands?.length ? paragraph(`Brand names: ${medication.brands.join(', ')}`, 'brand') : ''}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${report.medications.length + 1}">No facts were selected for this report.</td></tr>`}</tbody></table></div><footer>This is a saved snapshot, not a live medical record. Source dates may differ. Information may be incomplete or change after this report is created. Missing text does not mean a risk is absent. Public benchmarks are not retail prices or patient copays.</footer></main></body></html>`
}
