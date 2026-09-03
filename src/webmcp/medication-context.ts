import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCatalogStore } from '../stores/catalog.store'
import { useSelectionStore } from '../stores/selection.store'
import { useCartStore } from '../stores/cart.store'
import { useOrderStore } from '../stores/order.store'
import { usePrescriptionStore } from '../stores/prescription.store'
import { useDrugExplorerStore } from '../stores/drugExplorer.store'
import type { DynamicMedicationDependencies, DynamicMedicationSnapshot } from './dynamic'

const contexts = new WeakMap<object, DynamicMedicationDependencies>()
let contextSequence = 0
const sessionNonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID().slice(0, 12) : String(Date.now())

export const useMedicationToolDependencies = (): DynamicMedicationDependencies => {
  const catalog = useCatalogStore()
  const existing = contexts.get(catalog)
  if (existing) return existing
  const selection = useSelectionStore()
  const router = useRouter()
  const cart = useCartStore()
  const orders = useOrderStore()
  const prescriptions = usePrescriptionStore()
  const explorer = useDrugExplorerStore()
  let previousSignature = ''
  let revision = ''
  const snapshot = computed<DynamicMedicationSnapshot>(() => {
    const currentRoute = router.currentRoute.value
    const route = currentRoute.path
    const detail = catalog.medicationBySlug(String(currentRoute.params.slug ?? ''))
    const cartIds = cart.items.flatMap(item => catalog.skuById(item.skuId)?.medicationId ?? [])
    let pageIds: string[] = []
    if (detail) pageIds = [detail.id]
    else if (route === '/drugs/explore') pageIds = explorer.selectedDrugIds
    else if (route === '/medications') pageIds = catalog.filteredMedications.map(item => item.id)
    else if (route === '/') pageIds = ['med-atorvastatin', 'med-metformin', 'med-lisinopril', 'med-sertraline']
    else if (route === '/compare' && selection.medicationId) pageIds = [selection.medicationId]
    else if (route === '/prescription-card') pageIds = [selection.medicationId, prescriptions.latestRequest?.medicationId].filter((id): id is string => Boolean(id))
    else if (route === '/checkout') pageIds = cartIds
    else if (route.startsWith('/orders/')) pageIds = orders.orderById(String(currentRoute.params.id))?.items.flatMap(item => catalog.skuById(item.skuId)?.medicationId ?? []) ?? []
    if (cart.drawerOpen) pageIds = [...new Set([...pageIds, ...cartIds])]
    const choices = catalog.medications.filter(item => catalog.dataMode === 'demo' ? !item.publicOnly : catalog.dataMode === 'live' ? Boolean(item.publicSource) : true)
    const ordered = [...choices.filter(item => pageIds.includes(item.id)), ...choices.filter(item => !pageIds.includes(item.id))]
    const state = { route, dataMode: catalog.dataMode, catalog: ordered.map(item => ({ id: item.id, name: item.genericName })), pageMedicationIds: [...new Set(pageIds.filter(id => ordered.some(item => item.id === id)))] }
    // A route label alone does not change which medication IDs the tool may use.
    // Results read the current route at execution; scopes still invalidate on ID changes.
    const signature = JSON.stringify({ dataMode: state.dataMode, catalog: [...state.catalog].sort((a, b) => a.id.localeCompare(b.id)), pageMedicationIds: [...state.pageMedicationIds].sort() })
    if (signature !== previousSignature) {
      previousSignature = signature
      revision = `catalog-${sessionNonce}-${++contextSequence}`
    }
    return { ...state, revision }
  })
  const dependencies: DynamicMedicationDependencies = {
    getSnapshot: () => snapshot.value,
    findRelated: async input => {
      input.signal?.throwIfAborted()
      return catalog.findRelated(input.referenceMedicationId, input.candidateMedicationIds, input.basis)
    },
    compare: async input => {
      input.signal?.throwIfAborted()
      const result = await catalog.compareMedications(input.medicationIds, input.section)
      input.signal?.throwIfAborted()
      return { ...result, drugs: result.drugs.map(item => ({ ...item, status: item.status ?? 'unavailable' })) }
    },
  }
  contexts.set(catalog, dependencies)
  return dependencies
}
