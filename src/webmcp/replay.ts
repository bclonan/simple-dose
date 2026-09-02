import type { AgentActivity } from '../types/demo-db'
import { dynamicMedicationToolNames, type DynamicMedicationSnapshot, type MedicationDataMode } from './dynamic'
import { explorerToolNames, type ExplorerWorkspaceSnapshot } from './explorer'

export const prepareExplorerReplayInput = (entry: AgentActivity, snapshot: ExplorerWorkspaceSnapshot, input: Record<string, unknown>): Record<string, unknown> => {
  if (!explorerToolNames.some(name => name === entry.toolName)) return input
  if (entry.toolName === 'cleardose_get_explorer_state') return { ...input, ...(input.workspaceRevision ? { workspaceRevision: snapshot.revision } : {}) }
  const before = entry.contextBefore?.explorer
  if (!before || !entry.contextBefore?.dataMode || typeof input.workspaceRevision !== 'string') throw new Error('This workspace call has no saved context. Run it again with the current tools.')
  const sameIds = (a: string[], b: string[]) => [...a].sort().join(',') === [...b].sort().join(',')
  const currentIds = snapshot.selectedDrugs.map(drug => drug.id)
  if (entry.toolName !== 'cleardose_select_drugs' && !Array.isArray(input.drugs) && !sameIds(before.selectedDrugIds, currentIds)) {
    throw new Error('The saved fact call used different medications. Restore that selection before replaying this journey.')
  }
  if (entry.toolName === 'cleardose_update_fact_card' || entry.toolName === 'cleardose_remove_fact_card') {
    const oldCard = before.cards.find(card => card.id === input.cardId)
    const current = oldCard && snapshot.cards.find(card => card.factType === oldCard.factType && sameIds(card.drugIds, oldCard.drugIds))
    if (!current) throw new Error('The saved card no longer has a matching fact and medication selection. Review the current workspace before replaying.')
    return { ...input, cardId: current.id, workspaceRevision: snapshot.revision }
  }
  return { ...input, workspaceRevision: snapshot.revision }
}

const validateEntryMode = (entry: AgentActivity, dataMode: MedicationDataMode): void => {
  for (const context of [entry.contextBefore, entry.contextAfter]) {
    if (context?.dataMode && context.dataMode !== dataMode) {
      throw new Error(`The saved ${entry.toolName} call used ${context.dataMode} data. Select that data mode before replaying.`)
    }
  }
}

export const validateReplayDataModes = (entries: AgentActivity[], dataMode: MedicationDataMode): void => {
  entries.forEach(entry => validateEntryMode(entry, dataMode))
}

export const prepareReplayInput = (
  entry: AgentActivity,
  snapshot: DynamicMedicationSnapshot,
): Record<string, unknown> => {
  validateEntryMode(entry, snapshot.dataMode)
  if (entry.input !== undefined && (!entry.input || typeof entry.input !== 'object' || Array.isArray(entry.input))) {
    throw new Error('The saved tool input is invalid. Run the tool again with current inputs.')
  }
  const input = { ...(entry.input as Record<string, unknown> | undefined) }
  if (!dynamicMedicationToolNames.some(name => name === entry.toolName)) return input

  if (!entry.contextBefore?.dataMode || typeof input.contextRevision !== 'string' || !input.contextRevision) {
    throw new Error('This contextual call has no recorded data mode or revision. Run it again with the current WebMCP tools.')
  }
  const scope = input.scope ?? 'catalog'
  if (scope !== 'catalog' && scope !== 'page') throw new Error('The saved medication scope is invalid.')
  const ids = entry.toolName === 'find_related_medications'
    ? [input.referenceMedicationId]
    : input.medicationIds
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 4 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new Error('The saved medication IDs are invalid. Run the tool again with current medication IDs.')
  }
  const currentIds = new Set(snapshot.catalog.map(item => item.id))
  if (ids.some(id => !currentIds.has(id))) {
    throw new Error('A saved medication is no longer in the current catalog. Refresh the medications and review the tool inputs before replaying.')
  }
  if (scope === 'page' && ids.some(id => !snapshot.pageMedicationIds.includes(id))) {
    throw new Error('A saved page-scope medication is no longer on the current page. Return to that medication page or search before replaying.')
  }

  // Only reviewed replay calls may use a new revision. Native tool handlers retain their stale-context checks.
  return { ...input, contextRevision: snapshot.revision }
}
