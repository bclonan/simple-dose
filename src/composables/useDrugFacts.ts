import { useCatalogStore } from '../stores/catalog.store'
import { drugFactRegistry, drugFactTypes, hasFactContent, hasLongFactContent, selectDrugFact, type DrugFactDefinition, type DrugFactType } from '../domain/drug-facts'

const statusLabels = {
  live: 'Public data', cache: 'Cached public data', 'stale-cache': 'Older cached public data',
  demo: 'Demo mode', unavailable: 'Public data unavailable',
}

/** A projection of the shared catalog. Loading belongs to the catalog actions. */
export function useDrugFacts() {
  const catalog = useCatalogStore()
  function getFact(drugIds: readonly string[], factType: DrugFactType) {
    const definition: DrugFactDefinition = drugFactRegistry[factType]
    return {
      type: factType, title: definition.label, sourceLabel: definition.sourceLabel, notice: definition.notice,
      drugs: drugIds.map(drugId => {
        const record = catalog.publicRecords[drugId]
        const loading = Boolean(catalog.detailLoading[drugId])
        const fact = record?.drug && record.status !== 'demo' ? selectDrugFact(record.drug, factType) : undefined
        const demoMode = catalog.dataMode === 'demo'
        return {
          drugId, label: record?.drug?.identity.genericName ?? catalog.medicationById(drugId)?.genericName ?? drugId,
          loading, status: record?.status ?? 'unavailable', statusLabel: loading ? 'Loading requested facts...' : record?.status === 'demo' && !demoMode ? 'Demo fallback, public facts unavailable' : statusLabels[record?.status ?? 'unavailable'],
          message: record?.message,
          emptyMessage: record?.status === 'demo' ? demoMode ? 'Demo mode does not provide public clinical facts. Switch to hybrid or live data to request this information.' : 'Public facts are unavailable. Fictional demo fulfillment data does not supply clinical information. Retry public data when connected.' : loading ? 'Loading this fact from the shared medication record.' : definition.emptyMessage,
          content: fact, hasContent: fact ? hasFactContent(fact) : false, expandable: fact ? hasLongFactContent(fact) : false,
          notices: record?.drug?.warnings?.map(warning => `${warning.source}: ${warning.message}`) ?? [],
        }
      }),
    }
  }
  const getFacts = (drugIds: readonly string[], facts: readonly DrugFactType[]) => facts.map(fact => getFact(drugIds, fact))
  const availableFacts = (drugIds: readonly string[]) => drugFactTypes.filter(fact => drugIds.some(id => {
    const record = catalog.publicRecords[id]
    const drug = record?.status === 'demo' ? undefined : record?.drug
    return drug ? hasFactContent(selectDrugFact(drug, fact)) : false
  }))
  return { getFact, getFacts, availableFacts }
}
