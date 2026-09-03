import { afterEach, describe, expect, it, vi } from 'vitest'
import { NadacProvider } from '../../cleardose-data-plugin/src/providers/nadac'

const json = (results: unknown[], status = 200) => new Response(JSON.stringify({ results }), { status, headers: { 'content-type': 'application/json' } })
const codes = (count: number) => Array.from({ length: count }, (_, i) => String(50000000000 + i))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('NADAC package batch coverage', () => {
  it('finds a benchmark beyond the first four packages and rejects unrelated rows', async () => {
    const ndcs = codes(20)
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => json([
      { ndc: ndcs[17], nadac_per_unit: '11.18', as_of_date: '2026-09-02', effective_date: '2026-08-19', pricing_unit: 'EA' },
      { ndc: ndcs[17], nadac_per_unit: '13.01', as_of_date: '2026-09-02', effective_date: '2026-07-22', pricing_unit: 'EA' },
      { ndc: ndcs[17], nadac_per_unit: '12.01', as_of_date: '2026-08-26', pricing_unit: 'EA' },
      { ndc: '99999999999', nadac_per_unit: '0.01', as_of_date: '2026-09-02', pricing_unit: 'EA' },
    ]))
    vi.stubGlobal('fetch', fetcher)
    const result = await new NadacProvider('https://data.medicaid.gov', 'fixture', 2026).getQuotesWithWarnings({ ndcs, quantity: 30 })
    expect(result.quotes).toHaveLength(1)
    expect(result.quotes[0]).toMatchObject({ ndc: ndcs[17], amount: 335.4, kind: 'nadac-benchmark', quantity: 30 })
    const query = new URL(String(fetcher.mock.calls[0]![0])).searchParams
    expect(query.get('conditions[0][operator]')).toBe('IN')
    expect(query.get('conditions[0][value][17]')).toBe(ndcs[17])
    expect(query.get('limit')).toBe('100')
    expect(result.quotes[0]!.consumerMeaning).toContain('not the price a patient pays')
  })

  it('bounds queries to four batches with two concurrent requests and reports omitted packages', async () => {
    let active = 0; let peak = 0
    const fetcher = vi.fn(async () => {
      active++; peak = Math.max(peak, active)
      await Promise.resolve()
      active--
      return json([])
    })
    vi.stubGlobal('fetch', fetcher)
    const result = await new NadacProvider('https://data.medicaid.gov', 'fixture', 2026).getQuotesWithWarnings({ ndcs: codes(200) })
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(peak).toBeLessThanOrEqual(2)
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'partial', message: expect.stringContaining('100 of 200') }))
  })

  it('retains successful package batches when another fails and reports the failure', async () => {
    const ndcs = codes(30)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const first = new URL(String(input)).searchParams.get('conditions[0][value][0]')
      return first === ndcs[0] ? json([], 429) : json([{ ndc: ndcs[28], nadac_per_unit: '.10', as_of_date: '2026-09-02' }])
    }))
    const result = await new NadacProvider('https://data.medicaid.gov', 'fixture', 2026, { retries: 0 }).getQuotesWithWarnings({ ndcs })
    expect(result.quotes).toHaveLength(1)
    expect(result.warnings).toContainEqual(expect.objectContaining({ source: 'nadac', code: 'rate-limit' }))
  })
})
