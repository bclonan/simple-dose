import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClearDoseDataService } from '../../cleardose-data-plugin/src/service'
import { MemoryCache, type ClearDoseCache } from '../../cleardose-data-plugin/src/cache/cache'
import { IndexedDbCache } from '../../cleardose-data-plugin/src/cache/indexeddb'
import { OpenFdaProvider, type OpenFdaNdcRow } from '../../cleardose-data-plugin/src/providers/openfda'
import { NadacProvider } from '../../cleardose-data-plugin/src/providers/nadac'
import { LocalMedicareProvider } from '../../cleardose-data-plugin/src/providers/local-medicare'
import { LegacyDemoCashPriceProvider } from '../../cleardose-data-plugin/src/providers/demo-cash'
import { getJson, HttpTimeoutError } from '../../cleardose-data-plugin/src/utils/http'
import { resolveConfig, type ClearDosePluginConfig } from '../../cleardose-data-plugin/src/config'

const row: OpenFdaNdcRow = {
  generic_name: 'Metformin Hydrochloride', brand_name: 'Glucophage', product_ndc: '12345-6789',
  dosage_form: 'TABLET', route: ['ORAL'], active_ingredients: [{ name: 'METFORMIN HYDROCHLORIDE', strength: '500 mg/1' }],
  packaging: [{ package_ndc: '12345-6789-01' }], labeler_name: 'Example labeler',
  openfda: { rxcui: ['6809'], pharm_class_epc: ['Biguanide [EPC]'], spl_set_id: ['label-1'] },
}
const label = { set_id: 'label-1', effective_time: '20260901', openfda: { generic_name: ['METFORMIN HYDROCHLORIDE'], product_ndc: ['12345-6789'] }, indications_and_usage: ['Source indication text.'], warnings: ['Source warning text.'], adverse_reactions: ['Source adverse reactions.'] }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const service = (config: ClearDosePluginConfig = {}, cache?: ClearDoseCache) => new ClearDoseDataService({
  rxNorm: { enabled: false }, nadac: { enabled: false }, request: { retries: 0, timeoutMs: 500 }, ...config,
}, cache)
const mockProducts = () => vi.fn(async (input: RequestInfo | URL) => {
  const url = new URL(String(input))
  return json({ results: url.pathname.includes('/label') ? [label] : [row] })
})

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('public data plugin HTTP and identity', () => {
  it('never retries a permanent HTTP failure', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ error: 'bad request' }, 400))
    vi.stubGlobal('fetch', fetcher)
    await expect(getJson('https://api.fda.gov/example', {}, { retries: 3 })).rejects.toMatchObject({ status: 400 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('honors a caller abort before any HTTP request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const abort = new AbortController(); abort.abort()
    await expect(getJson('https://api.fda.gov/example', {}, { signal: abort.signal })).rejects.toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('uses real OR spaces and rejects unrelated FDA search responses', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ results: [row, { ...row, generic_name: 'Oxytocin', brand_name: 'Pitocin', openfda: {} }] }))
    vi.stubGlobal('fetch', fetcher)
    const rows = await new OpenFdaProvider('https://api.fda.gov').searchNdc('metformin')
    expect(rows).toHaveLength(1)
    const query = new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get('search')
    expect(query).toContain(' OR ')
    expect(query).not.toContain('+OR+')
  })
  it('supports an exact brand without admitting unrelated products', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ results: [row] })))
    expect((await service().search('Glucophage'))[0]?.genericName).toBe('Metformin Hydrochloride')
  })
  it('excludes bulk records before FDA pagination so a finished generic can resolve', async () => {
    const standalone = { ...row, generic_name: 'Empagliflozin', brand_name: 'Jardiance', product_type: 'HUMAN PRESCRIPTION DRUG', active_ingredients: [{ name: 'EMPAGLIFLOZIN' }], openfda: {} }
    const combination = { ...standalone, generic_name: 'empagliflozin and metformin hydrochloride', brand_name: 'Synjardy', active_ingredients: [{ name: 'EMPAGLIFLOZIN' }, { name: 'METFORMIN HYDROCHLORIDE' }] }
    const bulk = { ...standalone, brand_name: undefined, product_type: 'BULK INGREDIENT' }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const query = new URL(String(input)).searchParams.get('search') ?? ''
      const excludesBulk = query.includes('NOT product_type:"BULK INGREDIENT"') && query.includes('NOT product_type:"FOR FURTHER PROCESSING"')
      return json({ results: excludesBulk ? [combination, standalone] : [combination, bulk] })
    })
    vi.stubGlobal('fetch', fetcher)
    const hits = await service().search('empagliflozin')
    expect(hits.map(hit => hit.genericName)).toEqual(['empagliflozin and metformin hydrochloride', 'Empagliflozin'])
    expect(hits.find(hit => hit.genericName === 'Empagliflozin')?.brandNames).toEqual(['Jardiance'])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('has an empty state for a successful no-match query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'NOT_FOUND' } }, 404)))
    expect(await service().search('nothing-matches')).toEqual([])
  })
  it('distinguishes a malformed response from no matching records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ results: {} })))
    await expect(service().search('metformin')).rejects.toMatchObject({ code: 'malformed-response' })
  })
  it('uses one lightweight RxNorm fallback without clinical or price fan-out', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/drug/ndc.json') return json({}, 404)
      if (url.pathname.endsWith('/approximateTerm.json')) return json({ approximateGroup: { candidate: [{ rxcui: '6809', score: '95' }] } })
      if (url.pathname.endsWith('/properties.json')) return json({ properties: { name: 'metformin' } })
      return json({ idGroup: {} })
    })
    vi.stubGlobal('fetch', fetcher)
    const hits = await service({ rxNorm: { enabled: true } }).search('metfrmin')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ source: 'rxnorm', rxcui: '6809', genericName: 'metformin', forms: [], strengths: [] })
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('/label') && !String(url).includes('medicaid'))).toBe(true)
  })
  it('keeps one generic/ingredient group for drug detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ results: [row, { ...row, generic_name: 'Oxytocin', brand_name: 'Pitocin', active_ingredients: [{ name: 'OXYTOCIN' }], openfda: {} }, { ...row, active_ingredients: [{ name: 'METFORMIN HYDROCHLORIDE', strength: '1000 mg/1' }] }] })))
    const drug = await service().getDrug('Metformin Hydrochloride', { includeClinical: false, includePrices: false })
    expect(drug.variants).toHaveLength(2)
    expect(drug.activeIngredients).toEqual(['METFORMIN HYDROCHLORIDE'])
    expect(drug.strengths).toEqual(['500 mg/1', '1000 mg/1'])
  })
  it('does not merge ambiguous ingredient sets sharing a name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ results: [{ ...row, active_ingredients: [{ name: 'UNRELATED INGREDIENT ONE' }] }, { ...row, active_ingredients: [{ name: 'UNRELATED INGREDIENT TWO' }] }] })))
    await expect(service().getDrug('Metformin Hydrochloride', { includeClinical: false, includePrices: false })).rejects.toMatchObject({ code: 'ambiguous' })
  })
  it('prefers canonical generic ingredients over rare harmonized ER aliases', () => {
    const provider = new OpenFdaProvider('https://api.fda.gov')
    const er = { ...row, generic_name: 'Metformin ER 500 mg', brand_name: 'Metformin', openfda: { generic_name: ['metformin'], rxcui: ['6809'] } }
    const hcl = { ...row, generic_name: 'Metformin HCl' }
    expect(provider.selectIdentityRows([er, hcl, row], 'metformin', '6809')).toEqual([hcl, row])
    const oxytocin = { generic_name: 'Oxytocin', active_ingredients: [{ name: 'OXYTOCIN' }] }
    expect(provider.selectIdentityRows([oxytocin, { ...oxytocin, active_ingredients: [{ name: 'OXYTOCIN ACETATE' }] }], 'oxytocin')).toEqual([oxytocin])
  })
  it('selects one finished atorvastatin group without merging salts or choosing bulk powder', () => {
    const provider = new OpenFdaProvider('https://api.fda.gov')
    const tablet = { generic_name: 'Atorvastatin Calcium', dosage_form: 'TABLET, FILM COATED', marketing_category: 'ANDA', active_ingredients: [{ name: 'ATORVASTATIN CALCIUM TRIHYDRATE' }] }
    const secondTablet = { ...tablet, product_ndc: 'second-product' }
    const solvate = { ...tablet, active_ingredients: [{ name: 'ATORVASTATIN CALCIUM PROPYLENE GLYCOL SOLVATE' }] }
    const bulk = { ...tablet, dosage_form: 'POWDER', marketing_category: 'BULK INGREDIENT', active_ingredients: [{ name: 'ATORVASTATIN CALCIUM' }] }
    const rows = [bulk, tablet, solvate, secondTablet]
    expect(provider.selectIdentityRows(rows, 'Atorvastatin')).toEqual([tablet, secondTablet])
    expect(provider.selectIdentityRows(rows, 'atorvastatin calcium')).toEqual([tablet, secondTablet])
    expect(provider.finishedProducts(rows)).not.toContain(bulk)
  })
  it('retains actual FDA top-level class labels and excludes bulk data from search', async () => {
    const sourceClass = 'Angiotensin Converting Enzyme Inhibitor [EPC]'
    const sourceMechanism = 'Angiotensin-converting Enzyme Inhibitors [MoA]'
    const lisinopril = { ...row, generic_name: 'Lisinopril', brand_name: 'Lisinopril', marketing_category: 'ANDA', pharm_class: [sourceClass, sourceMechanism], openfda: {} }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ results: [lisinopril, { ...lisinopril, marketing_category: 'BULK INGREDIENT', dosage_form: 'POWDER' }] })))
    const provider = new OpenFdaProvider('https://api.fda.gov')
    const rows = await provider.searchNdc('lisinopril')
    expect(rows).toHaveLength(1)
    expect(provider.normalizeProducts(rows).pharmacologicClasses).toEqual([sourceClass, sourceMechanism])
  })
})

describe('public data plugin durability and provider isolation', () => {
  it('does not reuse incomplete searches cached before server-side finished-product filtering', async () => {
    const cache = new MemoryCache()
    const get = vi.spyOn(cache, 'get').mockImplementation(async key => key.includes(':search:') ? { value: [], retrievedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() } : undefined)
    const fetcher = mockProducts(); vi.stubGlobal('fetch', fetcher)
    expect(await service({}, cache).search('metformin')).toHaveLength(1)
    expect(get.mock.calls[0]?.[0]).toContain(':search-finished-v2:')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('deduplicates concurrent searches, preserves cache metadata, and respects custom TTL', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-02T00:00:00Z'))
    const fetcher = mockProducts(); vi.stubGlobal('fetch', fetcher)
    const data = service({ cache: { defaultTtlMs: 100 } })
    await Promise.all([data.search('metformin'), data.search('metformin')])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect((await data.search('metformin'))[0]?.dataMeta).toMatchObject({ origin: 'cache', stale: false })
    await vi.advanceTimersByTimeAsync(101)
    fetcher.mockRejectedValue(new Error('offline'))
    const stale = await data.search('metformin')
    expect(stale[0]?.dataMeta).toMatchObject({ origin: 'stale-cache', stale: true, retrievedAt: '2026-09-02T00:00:00.000Z' })
    expect(stale[0]?.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'network' })]))
  })
  it('really disables caching when requested', async () => {
    const fetcher = mockProducts(); vi.stubGlobal('fetch', fetcher)
    const data = service({ cache: { enabled: false } })
    await data.search('metformin'); await data.search('metformin')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('falls back to memory if persistent reads and writes fail', async () => {
    const broken: ClearDoseCache = { get: async () => { throw new Error('storage denied') }, set: async () => { throw new Error('quota exceeded') }, delete: async () => {}, clear: async () => {} }
    const fetcher = mockProducts(); vi.stubGlobal('fetch', fetcher)
    const data = service({}, broken)
    const first = await data.search('metformin')
    expect(first[0]?.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'cache-unavailable' })]))
    expect((await data.search('metformin'))[0]?.dataMeta?.origin).toBe('cache')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not reuse records across different provider configurations', async () => {
    const fetcher = mockProducts(); vi.stubGlobal('fetch', fetcher)
    const shared = new MemoryCache()
    await service({}, shared).search('metformin')
    await service({ openFda: { baseUrl: 'https://example.org' } }, shared).search('metformin')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('matches the FDA label identity instead of selecting the first response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => json({ results: String(input).includes('/label') ? [
      { openfda: { generic_name: ['Oxytocin'] }, warnings: ['WRONG LABEL'] }, label,
    ] : [row] })))
    const drug = await service().getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(drug.clinical?.warnings).toEqual(['Source warning text.'])
    expect(drug.clinical?.boxedWarnings).toEqual([])
    expect(drug.sources.find(source => source.source === 'openfda-label')?.url).toContain('label-1')
  })
  it('rejects unrelated labels while keeping a usable drug record', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => json({ results: String(input).includes('/label') ? [{ openfda: { generic_name: ['Oxytocin'] }, warnings: ['WRONG LABEL'] }] : [row] })))
    const drug = await service().getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(drug.clinical).toBeUndefined()
    expect(drug.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'openfda-label', code: 'not-found' })]))
  })
  it('retries a failed optional label immediately without refetching products', async () => {
    let labelRequests = 0; let productRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/label')) return ++labelRequests === 1 ? json({}, 429) : json({ results: [label] })
      productRequests++; return json({ results: [row] })
    }))
    const data = service()
    const first = await data.getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(first.clinical).toBeUndefined()
    expect(first.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'openfda-label', code: 'rate-limit' })]))
    const recovered = await data.getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(recovered.clinical?.warnings).toEqual(['Source warning text.'])
    expect(productRequests).toBe(1)
    expect(labelRequests).toBe(2)
  })
  it('reuses product and label cache across requested quantities', async () => {
    const fetcher = mockProducts(); vi.stubGlobal('fetch', fetcher)
    const data = service()
    await data.getDrug('Metformin Hydrochloride', { quantity: 30 })
    expect((await data.getDrug('Metformin Hydrochloride', { quantity: 60 })).dataMeta?.origin).toBe('cache')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('expires an assembled drug at its earliest live or cached source expiry', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-02T00:00:00Z'))
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/rxcui.json')) return json({ idGroup: { rxnormId: ['6809'] } })
      return json({ results: url.includes('/label') ? [label] : [row] })
    }))
    const data = service({ rxNorm: { enabled: true }, cache: { identityTtlMs: 10_000, productTtlMs: 1000, clinicalTtlMs: 500 } })
    const first = await data.getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(first.dataMeta).toMatchObject({ origin: 'live', stale: false, expiresAt: '2026-09-02T00:00:00.500Z' })
    await vi.advanceTimersByTimeAsync(501)
    const refreshed = await data.getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(refreshed.dataMeta).toMatchObject({ origin: 'live', stale: false, retrievedAt: '2026-09-02T00:00:00.501Z', expiresAt: '2026-09-02T00:00:01.000Z' })
  })
  it('does not reuse term-dependent product selection across shared RxCUI queries', async () => {
    const alpha = { ...row, generic_name: 'Common ingredient', brand_name: 'Alpha', active_ingredients: [{ name: 'FIRST INGREDIENT' }] }
    const beta = { ...row, generic_name: 'Common ingredient', brand_name: 'Beta', active_ingredients: [{ name: 'SECOND INGREDIENT' }] }
    let productRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/rxcui.json')) return json({ idGroup: { rxnormId: ['999'] } })
      productRequests++; return json({ results: [alpha, beta] })
    }))
    const data = service({ rxNorm: { enabled: true } })
    expect((await data.getDrug('Alpha', { includeClinical: false, includePrices: false })).identity.brandNames).toEqual(['Alpha'])
    expect((await data.getDrug('Beta', { includeClinical: false, includePrices: false })).identity.brandNames).toEqual(['Beta'])
    expect(productRequests).toBe(2)
  })
  it('serves a stale drug after expiry and network loss', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-02T00:00:00Z'))
    const fetcher = mockProducts(); vi.stubGlobal('fetch', fetcher)
    const data = service({ cache: { defaultTtlMs: 50 } })
    await data.getDrug('Metformin Hydrochloride', { includePrices: false })
    await vi.advanceTimersByTimeAsync(51); fetcher.mockRejectedValue(new Error('offline'))
    const drug = await data.getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(drug.dataMeta).toMatchObject({ origin: 'stale-cache', stale: true })
    expect(drug.clinical?.indications).toEqual(['Source indication text.'])
  })
  it('includes RxNorm and FAERS source stamps without incidence claims', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/rxcui.json')) return json({ idGroup: { rxnormId: ['6809'] } })
      if (url.includes('/event')) return json({ results: [{ term: 'HEADACHE', count: 4 }] })
      return json({ results: [row] })
    }))
    const drug = await service({ rxNorm: { enabled: true } }).getDrug('metformin', { includeClinical: false, includePrices: false, includeAdverseEventSummary: true })
    expect(drug.sources.map(source => source.source)).toEqual(expect.arrayContaining(['rxnorm', 'openfda-event']))
    expect(drug.sources.find(source => source.source === 'openfda-event')?.disclaimer).toContain('not incidence rates')
  })
  it('returns valid comparison members when another drug fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('missing') ? json({}, 404) : json({ results: [row] })))
    const result = await service().compare(['Metformin Hydrochloride', 'missing'], { includeClinical: false, includePrices: false })
    expect(result.drugs).toHaveLength(1)
    expect(result.unavailable?.[0]).toMatchObject({ query: 'missing', warning: { code: 'not-found' } })
  })
  it('retries partial NADAC failures without holding the drug response for a full TTL', async () => {
    vi.stubGlobal('fetch', mockProducts())
    const data = service({ nadac: { enabled: true, datasetId: 'test' } })
    const quotes = vi.spyOn(data.nadac!, 'getQuotesWithWarnings')
      .mockResolvedValueOnce({ quotes: [], warnings: [{ source: 'nadac', code: 'network', message: 'Partial network failure.' }] })
      .mockResolvedValueOnce({ quotes: [], warnings: [] })
    expect((await data.getDrug('Metformin Hydrochloride')).warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'network' })]))
    expect((await data.getDrug('Metformin Hydrochloride')).warnings?.some(warning => warning.code === 'network')).toBe(false)
    expect(quotes).toHaveBeenCalledTimes(2)
  })
})

describe('public price semantics', () => {
  it('requests latest exact-NDC NADAC rows, ignores unrelated rows and keeps benchmark kind', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ results: [
      { ndc: '12345678901', nadac_per_unit: '0.10', as_of_date: '2026-08-01', pricing_unit: 'EA' },
      { ndc: '99999999999', nadac_per_unit: '0.01', as_of_date: '2026-09-01', pricing_unit: 'EA' },
      { ndc: '12345678901', nadac_per_unit: '0.20', as_of_date: '2026-09-01', pricing_unit: 'EA' },
    ] }))
    vi.stubGlobal('fetch', fetcher)
    const quotes = await new NadacProvider('https://data.medicaid.gov', 'test-dataset', 2026).getQuotes({ ndcs: ['12345-6789-01'], name: 'metformin', quantity: 60 })
    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({ kind: 'nadac-benchmark', amount: 12, quantity: 60, unitAmount: .2 })
    expect(quotes[0]?.consumerMeaning).toContain('not the price a patient pays')
    const query = new URL(String(fetcher.mock.calls[0]?.[0])).searchParams
    expect(query.get('conditions[0][property]')).toBe('ndc')
    expect(query.get('conditions[0][value]')).toBe('12345678901')
    expect(query.get('sorts[0][order]')).toBe('desc')
    expect(query.get('limit')).toBe('1')
  })
  it('never turns a name-only NADAC match into a package benchmark', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(await new NadacProvider('https://data.medicaid.gov', 'test', 2026).getQuotes({ name: 'metformin' })).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('looks up five exact package NDCs in one bounded batch', async () => {
    const fetcher = vi.fn().mockImplementation(async () => json({ results: [] })); vi.stubGlobal('fetch', fetcher)
    const result = await new NadacProvider('https://data.medicaid.gov', 'test', 2026).getQuotesWithWarnings({ ndcs: ['12345678901', '12345678902', '12345678903', '12345678904', '12345678905'] })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.quotes).toEqual([])
  })
  it('does not mistake medication quantity for Medicare days supply', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ generatedAt: '2026-09-02', release: 'test', prices: [{ ndc: '12345-6789-01', unitCost: .25, daysSupply: 30, planName: 'Test plan' }] })))
    const quotes = await new LocalMedicareProvider('https://example.org/medicare.json').getQuotes(['12345678901'], 60)
    expect(quotes[0]).toMatchObject({ kind: 'medicare-plan-unit-cost', amount: 15, quantity: 60, plan: { daysSupply: 30 } })
    expect(resolveConfig().medicare.enabled).toBe(false)
  })
  it('labels demo quotes with exact strength, form and quantity', async () => {
    vi.stubGlobal('fetch', mockProducts())
    const drug = await service().getDrug('Metformin Hydrochloride', { includePrices: false, includeClinical: false })
    const provider = new LegacyDemoCashPriceProvider({ medications: [{ id: 'med-1', slug: drug.identity.slug, genericName: drug.identity.genericName }], skus: [{ id: 'sku-1', medicationId: 'med-1', quantity: 30, unit: 'tablet', form: 'tablet', strength: '500 mg' }], pharmacies: [{ id: 'p-1', name: 'Fictional pharmacy' }], offers: [{ id: 'o-1', skuId: 'sku-1', pharmacyId: 'p-1', pricing: { medicationCost: 5 } }] })
    const quotes = await provider.getQuotes({ drug, quantity: 30 })
    expect(quotes[0]).toMatchObject({ kind: 'demo', product: { skuId: 'sku-1', strength: '500 mg', form: 'tablet' } })
    expect(quotes[0]?.label).toContain('500 mg, tablet, 30 tablet')
  })
})

describe('targeted FDA label lookup and recovery', () => {
  it('bounds SPL set queries and requests the latest single source label', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ results: [label] }))
    vi.stubGlobal('fetch', fetcher)
    await new OpenFdaProvider('https://api.fda.gov').labelsBySetIds(Array.from({ length: 20 }, (_, index) => `set-${String(index).padStart(2, '0')}`))
    const params = new URL(String(fetcher.mock.calls[0]?.[0])).searchParams
    expect(params.get('search')?.split(' OR ')).toHaveLength(12)
    expect(params.get('search')).toContain('set_id:"set-00"')
    expect(params.get('search')).not.toContain('set-19')
    expect(params.get('sort')).toBe('effective_time:desc')
    expect(params.get('limit')).toBe('1')
  })

  it('uses source SPL IDs first and preserves the newest matching label text and provenance', async () => {
    const old = { ...label, set_id: 'older-label', effective_time: '20200101', drug_interactions: ['Old label.'] }
    const newest = { ...label, effective_time: '20260902', drug_interactions: ['Complete source paragraph. '.repeat(1000)] }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => json({ results: String(input).includes('/label') ? [old, newest] : [{ ...row, openfda: { ...row.openfda, spl_set_id: ['older-label', 'label-1'] } }] }))
    vi.stubGlobal('fetch', fetcher)
    const drug = await service().getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(drug.clinical?.drugInteractions).toEqual(newest.drug_interactions)
    expect(drug.sources.find(source => source.source === 'openfda-label')).toMatchObject({ effectiveAt: '20260902', url: expect.stringContaining('label-1') })
    expect(String(fetcher.mock.calls.find(call => String(call[0]).includes('/label'))?.[0])).toContain('set_id')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('falls back from a successful SPL miss to an exact name query without accepting a combination label', async () => {
    const combination = { ...label, set_id: 'combo', effective_time: '20260903', openfda: { generic_name: ['Empagliflozin and Metformin Hydrochloride'], rxcui: ['6809'] }, drug_interactions: ['WRONG COMBINATION'] }
    const standalone = { ...label, drug_interactions: ['Standalone interactions.'] }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (!url.pathname.includes('/label')) return json({ results: [row] })
      if (url.searchParams.get('search')?.includes('set_id:')) return json({}, 404)
      return json({ results: [combination, standalone] })
    })
    vi.stubGlobal('fetch', fetcher)
    const drug = await service().getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(drug.clinical?.drugInteractions).toEqual(['Standalone interactions.'])
    const requests = fetcher.mock.calls.map(call => new URL(String(call[0]))).filter(url => url.pathname.includes('/label'))
    expect(requests).toHaveLength(2)
    expect(requests[1]?.searchParams.get('search')).toContain('openfda.generic_name.exact:"METFORMIN HYDROCHLORIDE"')
    expect(requests[1]?.searchParams.get('search')).not.toContain('openfda.generic_name:"')
    expect(drug.sources.find(source => source.source === 'openfda-label')?.disclaimer).toContain('generic-matched')
  })

  it('does not reuse a label cache across distinct source products with the same generic name', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const beta = url.searchParams.get('search')?.includes('Beta') || url.searchParams.get('search')?.includes('set-beta')
      if (url.pathname.includes('/label')) return json({ results: [{ ...label, set_id: beta ? 'set-beta' : 'set-alpha', openfda: { generic_name: ['Common ingredient'] }, drug_interactions: [beta ? 'Beta source.' : 'Alpha source.'] }] })
      return json({ results: [{ ...row, generic_name: 'Common ingredient', brand_name: beta ? 'Beta' : 'Alpha', product_ndc: beta ? '22222-2222' : '11111-1111', openfda: { spl_set_id: [beta ? 'set-beta' : 'set-alpha'] } }] })
    })
    vi.stubGlobal('fetch', fetcher)
    const data = service()
    expect((await data.getDrug('Alpha', { includePrices: false })).clinical?.drugInteractions).toEqual(['Alpha source.'])
    expect((await data.getDrug('Beta', { includePrices: false })).clinical?.drugInteractions).toEqual(['Beta source.'])
    expect(fetcher.mock.calls.filter(call => String(call[0]).includes('/label'))).toHaveLength(2)
  })

  it('does not reuse the old broad label cache namespace', async () => {
    const cache = new MemoryCache()
    const get = vi.spyOn(cache, 'get').mockResolvedValue(undefined)
    vi.stubGlobal('fetch', mockProducts())
    await service({}, cache).getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(get.mock.calls.some(([key]) => key.includes(':labels-targeted-v2:'))).toBe(true)
    expect(get.mock.calls.some(([key]) => key.includes(':labels:'))).toBe(false)
  })

  it('reports a timeout explicitly and recovers labels without refetching cached products', async () => {
    vi.useFakeTimers()
    let offline = true
    const fetcher = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      if (!String(input).includes('/label')) return json({ results: [row] })
      if (!offline) return json({ results: [label] })
      return new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
    })
    vi.stubGlobal('fetch', fetcher)
    const data = service()
    const pending = data.getDrug('Metformin Hydrochloride', { includePrices: false })
    await vi.advanceTimersByTimeAsync(501)
    const unavailable = await pending
    expect(unavailable.clinical).toBeUndefined()
    expect(unavailable.warnings).toContainEqual(expect.objectContaining({ source: 'openfda-label', code: 'network', message: expect.stringContaining('timed out after 500 ms') }))
    offline = false
    const recovered = await data.getDrug('Metformin Hydrochloride', { includePrices: false })
    expect(recovered.clinical?.adverseReactions).toEqual(label.adverse_reactions)
    expect(recovered.warnings?.some(warning => warning.message.includes('timed out'))).toBe(false)
    expect(fetcher.mock.calls.filter(call => !String(call[0]).includes('/label'))).toHaveLength(1)
    expect(fetcher.mock.calls.filter(call => String(call[0]).includes('/label'))).toHaveLength(2)
  })

  it('distinguishes interrupted connections, invalid JSON and invalid clinical fields', async () => {
    for (const failure of ['network', 'json', 'field'] as const) {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).includes('/label')) return json({ results: [row] })
        if (failure === 'network') throw new TypeError('Failed to fetch')
        if (failure === 'json') return new Response('invalid json', { status: 200 })
        return json({ results: [{ ...label, drug_interactions: { invalid: 'not source text' } }] })
      }))
      const drug = await service().getDrug('Metformin Hydrochloride', { includePrices: false })
      expect(drug.clinical).toBeUndefined()
      const warning = drug.warnings?.find(item => item.source === 'openfda-label')
      expect(warning?.code).toBe(failure === 'network' ? 'network' : 'malformed-response')
      expect(warning?.message).toContain(failure === 'network' ? 'could not be reached' : failure === 'json' ? 'invalid JSON' : 'invalid label record')
    }
  })

  it('bounds configured timeout retries without mislabeling a caller cancellation', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })))
    vi.stubGlobal('fetch', fetcher)
    const pending = getJson('https://api.fda.gov/drug/label.json', {}, { timeoutMs: 10, retries: 1 })
    const checked = expect(pending).rejects.toBeInstanceOf(HttpTimeoutError)
    await vi.advanceTimersByTimeAsync(271); await checked
    expect(fetcher).toHaveBeenCalledTimes(2)
    const controller = new AbortController()
    const cancelled = getJson('https://api.fda.gov/drug/label.json', {}, { timeoutMs: 10, retries: 1, signal: controller.signal })
    const cancellation = expect(cancelled).rejects.not.toBeInstanceOf(HttpTimeoutError)
    controller.abort(); await cancellation
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})

describe('IndexedDB failure bounds', () => {
  it('rejects a blocked open instead of waiting forever', async () => {
    const request: Partial<IDBOpenDBRequest> = {}
    vi.stubGlobal('indexedDB', { open: vi.fn(() => request) })
    const pending = new IndexedDbCache().get('key')
    request.onblocked?.call(request as IDBOpenDBRequest, new Event('blocked') as IDBVersionChangeEvent)
    await expect(pending).rejects.toThrow('blocked')
  })
  it('times out an unresponsive open and closes a late database handle', async () => {
    vi.useFakeTimers()
    const close = vi.fn()
    const request = { result: { close } } as unknown as IDBOpenDBRequest
    vi.stubGlobal('indexedDB', { open: vi.fn(() => request) })
    const pending = new IndexedDbCache('test', 100, 20).get('key')
    const rejection = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(21); await rejection
    request.onsuccess?.call(request, new Event('success'))
    expect(close).toHaveBeenCalledTimes(1)
  })
})
