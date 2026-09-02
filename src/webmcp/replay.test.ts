import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentActivity, AgentActivityContext } from '../types/demo-db'
import { createDynamicMedicationTools, type DynamicMedicationDependencies, type DynamicMedicationSnapshot } from './dynamic'
import { prepareExplorerReplayInput, prepareReplayInput, validateReplayDataModes } from './replay'
import type { ExplorerWorkspaceSnapshot } from './explorer'

const snapshot = (): DynamicMedicationSnapshot => ({
  revision: 'catalog-new-session-2', route: '/medications', dataMode: 'hybrid',
  catalog: [{ id: 'med-atorvastatin', name: 'Atorvastatin' }, { id: 'med-rosuvastatin', name: 'Rosuvastatin' }],
  pageMedicationIds: ['med-atorvastatin'],
})

const context = (): AgentActivityContext => ({
  route: '/medications', dataMode: 'hybrid', catalogMedicationIds: ['med-atorvastatin', 'med-rosuvastatin'],
  pricingScenario: { id: 'base', label: 'Demo baseline', effectiveAt: '2026-09-02' },
  selection: { medicationId: null, skuId: null, offerId: null, deliveryOptionId: null, form: null, strength: null, quantity: null },
  cart: { itemCount: 0, itemIds: [], offerIds: [], medicationSubtotal: 0, deliveryTotal: 0, grandTotal: 0 },
  currentOrder: null,
})

const entry = (input: Record<string, unknown> = {}): AgentActivity => ({
  id: 'activity-1', journeyId: 'journey-1', journeyTitle: 'Medication discovery',
  timestamp: '2026-09-02T12:00:00Z', source: 'agent', type: 'tool', status: 'success',
  toolName: 'find_related_medications', contextBefore: context(), contextAfter: context(),
  input: { contextRevision: 'catalog-old-session-8', referenceMedicationId: 'med-atorvastatin', scope: 'catalog', basis: 'form', offset: 5, limit: 10, ...input },
})

describe('reviewed contextual journey replay', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('rebinds reviewed workspace card IDs by fact and medication identity, not by a coincidentally reused ID', () => {
    const workspace: ExplorerWorkspaceSnapshot = { revision: 'explorer-new', selectedDrugs: [{ id: 'med-atorvastatin', name: 'Atorvastatin' }], catalog: snapshot().catalog, cards: [{ id: 'fact-9', factType: 'uses', drugIds: ['med-atorvastatin'] }] }
    const before = { ...context(), explorer: { revision: 'old', selectedDrugIds: ['med-atorvastatin'], cards: [{ id: 'fact-1', factType: 'uses', drugIds: ['med-atorvastatin'] }] } }
    const input = { workspaceRevision: 'old', cardId: 'fact-1', fact: 'warnings' }
    const saved = { ...entry(), toolName: 'cleardose_update_fact_card', contextBefore: before, input }
    expect(prepareExplorerReplayInput(saved, workspace, input)).toEqual({ ...input, cardId: 'fact-9', workspaceRevision: 'explorer-new' })
    expect(input.cardId).toBe('fact-1')
    expect(() => prepareExplorerReplayInput(saved, { ...workspace, cards: [{ ...workspace.cards[0]!, factType: 'pricing' }] }, input)).toThrow('matching fact')
    expect(() => prepareExplorerReplayInput(saved, { ...workspace, selectedDrugs: [{ id: 'med-metformin', name: 'Metformin' }] }, input)).toThrow('different medications')
  })
  it('never silently repairs missing explorer audit context', () => {
    const workspace: ExplorerWorkspaceSnapshot = { revision: 'new', selectedDrugs: [], catalog: [], cards: [] }
    const saved = { ...entry(), toolName: 'cleardose_select_drugs', input: { workspaceRevision: 'old', drugs: ['metformin'] } }
    expect(() => prepareExplorerReplayInput(saved, workspace, saved.input)).toThrow('no saved context')
  })

  it('rebinds an old session revision only after validating current mode and IDs, without changing the saved input', () => {
    const saved = entry()
    const input = prepareReplayInput(saved, snapshot())
    expect(input).toEqual({ ...(saved.input as object), contextRevision: 'catalog-new-session-2' })
    expect(saved.input).toMatchObject({ contextRevision: 'catalog-old-session-8', offset: 5, limit: 10 })
  })

  it('checks every comparison medication and rejects page-scope IDs no longer visible', () => {
    const saved = { ...entry(), toolName: 'compare_medications', input: { contextRevision: 'old', medicationIds: ['med-atorvastatin', 'med-rosuvastatin'], scope: 'catalog', section: 'clinical' } }
    expect(prepareReplayInput(saved, snapshot())).toMatchObject({ medicationIds: ['med-atorvastatin', 'med-rosuvastatin'], section: 'clinical', contextRevision: snapshot().revision })
    expect(() => prepareReplayInput({ ...saved, input: { ...saved.input, scope: 'page' } }, snapshot())).toThrow('no longer on the current page')
    expect(() => prepareReplayInput({ ...saved, input: { ...saved.input, medicationIds: ['med-missing'] } }, snapshot())).toThrow('no longer in the current catalog')
    expect(() => prepareReplayInput(entry({ scope: 'page' }), { ...snapshot(), pageMedicationIds: ['med-rosuvastatin'] })).toThrow('no longer on the current page')
    expect(prepareReplayInput(entry({ scope: 'page' }), snapshot()).scope).toBe('page')
  })

  it('preflights every entry and both recorded modes before a journey can run', () => {
    const later = { ...entry(), id: 'activity-2', contextBefore: { ...context(), dataMode: 'live' as const } }
    expect(() => validateReplayDataModes([entry(), later], 'hybrid')).toThrow('used live data')
    expect(() => validateReplayDataModes([{ ...entry(), contextAfter: { ...context(), dataMode: 'demo' } }], 'hybrid')).toThrow('used demo data')
    expect(() => prepareReplayInput(entry(), { ...snapshot(), dataMode: 'live' })).toThrow('used hybrid data')
  })

  it('does not repair missing context, invalid scope, or malformed medication IDs', () => {
    expect(() => prepareReplayInput({ ...entry(), contextBefore: undefined }, snapshot())).toThrow('no recorded data mode or revision')
    expect(() => prepareReplayInput(entry({ contextRevision: undefined }), snapshot())).toThrow('no recorded data mode or revision')
    expect(() => prepareReplayInput(entry({ scope: 'other' }), snapshot())).toThrow('scope is invalid')
    expect(() => prepareReplayInput(entry({ referenceMedicationId: null }), snapshot())).toThrow('medication IDs are invalid')
    expect(() => prepareReplayInput({ ...entry(), toolName: 'compare_medications', input: { contextRevision: 'old', medicationIds: ['med-atorvastatin', 'med-atorvastatin'] } }, snapshot())).toThrow('medication IDs are invalid')
  })

  it('preserves legacy non-contextual input and still enforces any recorded mode', () => {
    const saved = { ...entry(), toolName: 'add_to_cart', contextBefore: undefined, contextAfter: undefined, input: { offerId: 'offer-1', deliveryOptionId: 'delivery-1' } }
    expect(prepareReplayInput(saved, snapshot())).toEqual(saved.input)
    expect(prepareReplayInput({ ...saved, toolName: 'view_cart', input: undefined }, snapshot())).toEqual({})
    expect(() => prepareReplayInput({ ...saved, input: [] }, snapshot())).toThrow('saved tool input is invalid')
  })

  it('executes safely rebound input while the unmodified native handler still rejects the saved revision', async () => {
    const current = snapshot()
    const dependencies: DynamicMedicationDependencies = {
      getSnapshot: () => current,
      findRelated: vi.fn(async () => ({ matches: [], notice: 'Reference comparison only.' })),
      compare: vi.fn(),
    }
    const tool = createDynamicMedicationTools(dependencies, 'demo', current)[0]!
    const saved = entry({ offset: 0 })
    await expect(tool.execute(saved.input)).rejects.toThrow('Medication context changed')
    await expect(tool.execute(prepareReplayInput(saved, current))).resolves.toMatchObject({ contextRevision: current.revision })
    expect(dependencies.findRelated).toHaveBeenCalledOnce()
  })

  it('still rejects a page or catalog change after replay input validation', async () => {
    let current = snapshot()
    const dependencies: DynamicMedicationDependencies = {
      getSnapshot: () => current, findRelated: vi.fn(), compare: vi.fn(),
    }
    const input = prepareReplayInput(entry({ scope: 'page' }), current)
    const tool = createDynamicMedicationTools(dependencies, 'demo', current)[0]!
    current = { ...current, revision: 'catalog-new-session-3', pageMedicationIds: ['med-rosuvastatin'] }
    await expect(tool.execute(input)).rejects.toThrow('Medication context changed')
    expect(dependencies.findRelated).not.toHaveBeenCalled()
  })
})
