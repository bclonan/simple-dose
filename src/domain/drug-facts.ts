import type { ClearDoseDrug, DrugClinical, DrugPriceKind, DrugPriceQuote, GetDrugOptions, SourceStamp } from '../../cleardose-data-plugin/src/types'

export interface DrugFactSource {
  label: string
  url?: string
  retrieved: string
  effective?: string
  dataset?: string
  disclaimer?: string
}
export interface DrugFactPrice {
  id: string
  label: string
  amount: string
  unitAmount?: string
  dimensions: string
  basis: string
  ndc?: string
  plan?: string
  meaning: string
  effective: string
  source: DrugFactSource
}
export interface DrugFactPriceGroup {
  kind: DrugPriceKind
  label: string
  notice: string
  quotes: DrugFactPrice[]
}
export interface DrugFactContent {
  items: string[]
  values: Array<{ label: string; value: string }>
  priceGroups: DrugFactPriceGroup[]
  events: Array<{ reaction: string; reports: string }>
  sources: DrugFactSource[]
}
export interface DrugFactDefinition {
  label: string
  sourceLabel: string
  quick: boolean
  quickOrder?: number
  load: 'product' | 'clinical' | 'pricing' | 'adverse-events'
  emptyMessage: string
  notice?: string
  selector(drug: ClearDoseDrug): DrugFactContent
}

export const drugSourceNames: Record<string, string> = {
  rxnorm: 'RxNorm', 'openfda-ndc': 'FDA NDC product directory', 'openfda-label': 'FDA drug label',
  'openfda-event': 'FDA adverse-event reports', nadac: 'CMS Medicaid NADAC', 'cms-part-d': 'CMS Medicare Part D',
  demo: 'ClearDose demo fixture',
}
export function factDate(value?: string): string {
  if (!value) return 'Date unavailable'
  const normalized = /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value
  const date = new Date(normalized)
  return Number.isNaN(date.valueOf()) ? 'Date unavailable' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
export function selectFactSource(source: SourceStamp): DrugFactSource {
  let url: string | undefined
  try {
    const parsed = new URL(source.url ?? '')
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed.href
  } catch { /* Source metadata can omit a public URL. */ }
  return {
    label: drugSourceNames[source.source] ?? source.source, url, retrieved: factDate(source.retrievedAt),
    effective: source.effectiveAt ? factDate(source.effectiveAt) : undefined,
    dataset: source.datasetVersion, disclaimer: source.disclaimer,
  }
}
const sourcesFor = (drug: ClearDoseDrug, sourceIds: string[]) => drug.sources.filter(source => sourceIds.includes(source.source)).map(selectFactSource)
const content = (sources: DrugFactSource[], fields: Partial<Omit<DrugFactContent, 'sources'>> = {}): DrugFactContent => ({ items: [], values: [], priceGroups: [], events: [], ...fields, sources })
const values = (entries: Array<[string, string | undefined]>): DrugFactContent['values'] => entries.flatMap(([label, value]) => value?.trim() ? [{ label, value }] : [])
const join = (items: string[]) => items.join(', ')
export const selectClinicalItems = (drug: ClearDoseDrug, field: keyof DrugClinical): string[] => [...(drug.clinical?.[field] ?? [])]
const clinical = (field: keyof DrugClinical) => (drug: ClearDoseDrug) => content(sourcesFor(drug, ['openfda-label']), { items: selectClinicalItems(drug, field) })
const missingClinical = 'This section is unavailable in the loaded FDA label. Missing information does not establish that a risk is absent.'
export const factMoney = (amount: number, unit = false) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: unit ? 6 : 2 }).format(amount)

export const drugPriceKinds: Record<DrugPriceKind, { label: string; notice: string }> = {
  'nadac-benchmark': { label: 'Public acquisition benchmark', notice: 'NADAC estimates pharmacy acquisition cost. This is not a retail cash price, a patient copay, or evidence of pharmacy availability.' },
  'medicare-plan-unit-cost': { label: 'Medicare plan pricing', notice: 'Published plan unit-cost context. It is not a guaranteed patient copay or out-of-pocket cost.' },
  'medicare-part-d-gross': { label: 'Medicare gross spending', notice: 'Gross spending is not the amount a patient pays.' },
  cash: { label: 'Provider cash price', notice: 'Provider-reported cash data. Confirm the current quote and availability with that provider.' },
  discount: { label: 'Provider discount price', notice: 'Provider-reported discount data. Eligibility and current availability are not verified here.' },
  demo: { label: 'Fictional demo cash price', notice: 'Fictional demonstration data, not a live pharmacy quote.' },
}
function selectPrice(quote: DrugPriceQuote): DrugFactPrice {
  return {
    id: quote.id, label: quote.label, amount: factMoney(quote.amount),
    unitAmount: quote.unitAmount === undefined ? undefined : factMoney(quote.unitAmount, true),
    dimensions: [quote.product?.strength, quote.product?.form, quote.quantity === undefined ? undefined : `${quote.quantity} ${quote.unit ?? 'units'}`].filter(Boolean).join(', '),
    basis: quote.basis, ndc: quote.ndc, plan: quote.plan?.planName, meaning: quote.consumerMeaning,
    effective: factDate(quote.effectiveDate ?? quote.asOfDate ?? quote.source.effectiveAt), source: selectFactSource(quote.source),
  }
}
const selectPrices = (drug: ClearDoseDrug): DrugFactContent => {
  const grouped = (Object.keys(drugPriceKinds) as DrugPriceKind[]).map(kind => ({ kind, ...drugPriceKinds[kind], quotes: drug.prices.filter(quote => quote.kind === kind).map(selectPrice) }))
  const sources = [...new Map(drug.prices.map(quote => [`${quote.source.source}:${quote.source.url ?? ''}`, selectFactSource(quote.source)])).values()]
  return content(sources, { priceGroups: grouped.filter(group => group.quotes.length) })
}

const definitions = {
  identity: {
    label: 'Drug identity', sourceLabel: 'FDA products and RxNorm', quick: false, load: 'product',
    emptyMessage: 'Public drug identity information is unavailable.',
    selector: (drug: ClearDoseDrug) => content(sourcesFor(drug, ['rxnorm', 'openfda-ndc']), { values: values([
      ['Generic name', drug.identity.genericName], ['Brand names', join(drug.identity.brandNames)], ['RxCUI', drug.identity.rxcui],
      ['Package NDCs', join(drug.identity.ndcs)], ['Product NDCs', join(drug.identity.productNdcs)],
      ['Application numbers', join(drug.identity.applicationNumbers)], ['SPL set IDs', join(drug.identity.splSetIds)],
      ['Manufacturers and labelers', join(drug.manufacturers)],
    ]) }),
  },
  uses: { label: 'Uses', sourceLabel: 'FDA label', quick: true, quickOrder: 0, load: 'clinical', emptyMessage: missingClinical, selector: clinical('indications') },
  ingredients: {
    label: 'Active ingredients', sourceLabel: 'FDA product data', quick: true, quickOrder: 5, load: 'product',
    emptyMessage: 'Active ingredient information is unavailable from the loaded public record.',
    notice: 'A shared ingredient or drug class does not establish dose equivalence or interchangeability.',
    selector: (drug: ClearDoseDrug) => content(sourcesFor(drug, ['openfda-ndc']), { items: [...drug.activeIngredients], values: values([['Pharmacologic classes', join(drug.pharmacologicClasses)]]) }),
  },
  strengths: {
    label: 'Strengths and forms', sourceLabel: 'FDA product data', quick: false, load: 'product',
    emptyMessage: 'Strength and dosage-form information is unavailable from the loaded public record.',
    notice: 'These are product attributes, not dosing instructions or equivalent-dose recommendations.',
    selector: (drug: ClearDoseDrug) => content(sourcesFor(drug, ['openfda-ndc']), { values: values([['Strengths', join(drug.strengths)], ['Dosage forms', join(drug.forms)], ['Routes', join(drug.routes)]]) }),
  },
  'side-effects': { label: 'Side effects', sourceLabel: 'FDA adverse-reaction label section', quick: true, quickOrder: 1, load: 'clinical', emptyMessage: missingClinical, selector: clinical('adverseReactions') },
  warnings: {
    label: 'Warnings', sourceLabel: 'FDA label', quick: true, quickOrder: 2, load: 'clinical', emptyMessage: missingClinical,
    notice: 'Missing warnings do not mean a medication is safe for a particular person.',
    selector: (drug: ClearDoseDrug) => content(sourcesFor(drug, ['openfda-label']), { items: selectClinicalItems(drug, 'warnings'), values: selectClinicalItems(drug, 'contraindications').map(value => ({ label: 'Contraindication', value })) }),
  },
  'boxed-warnings': { label: 'Boxed warnings', sourceLabel: 'FDA label', quick: true, quickOrder: 3, load: 'clinical', emptyMessage: missingClinical, selector: clinical('boxedWarnings') },
  interactions: {
    label: 'FDA-labeled drug interactions', sourceLabel: 'FDA label', quick: true, quickOrder: 4, load: 'clinical', emptyMessage: missingClinical,
    notice: 'These are individual medication label sections, not a complete pairwise interaction check. Selecting two drugs does not establish that they interact.',
    selector: clinical('drugInteractions'),
  },
  pricing: {
    label: 'Pricing and benchmarks', sourceLabel: 'Each price keeps its own source', quick: true, quickOrder: 6, load: 'pricing',
    emptyMessage: 'No price or benchmark was available from the requested providers. This does not establish retail availability.',
    notice: 'Compare only like-for-like products and quantities. Public benchmarks never become purchasable cart offers.',
    selector: selectPrices,
  },
  'clinical-pharmacology': { label: 'Clinical pharmacology', sourceLabel: 'FDA label', quick: false, load: 'clinical', emptyMessage: missingClinical, selector: clinical('clinicalPharmacology') },
  pregnancy: { label: 'Pregnancy information', sourceLabel: 'FDA label', quick: false, load: 'clinical', emptyMessage: 'No structured pregnancy section was available from the loaded FDA label. Absence is not a safety finding.', selector: clinical('pregnancy') },
  pediatric: { label: 'Pediatric use', sourceLabel: 'FDA label', quick: false, load: 'clinical', emptyMessage: missingClinical, selector: clinical('pediatricUse') },
  geriatric: { label: 'Geriatric use', sourceLabel: 'FDA label', quick: false, load: 'clinical', emptyMessage: missingClinical, selector: clinical('geriatricUse') },
  'adverse-events': {
    label: 'Reported adverse events', sourceLabel: 'FDA adverse-event reports', quick: false, load: 'adverse-events',
    emptyMessage: 'No adverse-event summary was available. Missing reports do not establish the absence of a risk.',
    notice: 'Reports do not establish that the medication caused the event. Counts are not incidence rates or a comparison of medication safety.',
    selector: (drug: ClearDoseDrug) => content(sourcesFor(drug, ['openfda-event']), { events: (drug.reportedAdverseEvents ?? []).map(event => ({ reaction: event.reaction, reports: event.reports.toLocaleString('en-US') })) }),
  },
} satisfies Record<string, DrugFactDefinition>

export type DrugFactType = keyof typeof definitions
export const drugFactRegistry: Record<DrugFactType, DrugFactDefinition> = definitions
export interface DrugFactCard { id: string; factType: DrugFactType; drugIds: string[] }
export const drugFactTypes = Object.keys(drugFactRegistry) as DrugFactType[]
export const quickDrugFacts = drugFactTypes.filter(fact => drugFactRegistry[fact].quick).sort((a, b) => (drugFactRegistry[a].quickOrder ?? 0) - (drugFactRegistry[b].quickOrder ?? 0))
export const isDrugFactType = (value: unknown): value is DrugFactType => typeof value === 'string' && Object.hasOwn(drugFactRegistry, value)
export function factLoadOptions(facts: readonly DrugFactType[]): Required<Pick<GetDrugOptions, 'includeClinical' | 'includePrices' | 'includeAdverseEventSummary'>> {
  const requested = new Set(facts.map(fact => drugFactRegistry[fact].load))
  return { includeClinical: requested.has('clinical'), includePrices: requested.has('pricing'), includeAdverseEventSummary: requested.has('adverse-events') }
}
export const selectDrugFact = (drug: ClearDoseDrug, fact: DrugFactType): DrugFactContent => drugFactRegistry[fact].selector(drug)
export const hasFactContent = (fact: DrugFactContent): boolean => Boolean(fact.items.length || fact.values.length || fact.priceGroups.length || fact.events.length)
export const hasLongFactContent = (fact: DrugFactContent): boolean => fact.items.length > 2 || fact.values.length > 4 || fact.events.length > 5 || fact.priceGroups.some(group => group.quotes.length > 2) || [...fact.items, ...fact.values.map(value => value.value)].some(value => value.length > 650)
