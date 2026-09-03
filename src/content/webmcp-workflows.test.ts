import { describe, expect, it } from 'vitest'
import { clearDoseToolNames } from '../webmcp/definitions'
import { dynamicMedicationToolNames } from '../webmcp/dynamic'
import { explorerToolNames } from '../webmcp/explorer'
import { documentedWorkflows, featurePrompts } from './webmcp-workflows'

describe('documentation workflows', () => {
  it('documents five complete chains using only canonical tools', () => {
    const names = new Set<string>([...clearDoseToolNames, ...dynamicMedicationToolNames, ...explorerToolNames])
    expect(documentedWorkflows).toHaveLength(5)
    for (const workflow of documentedWorkflows) {
      expect(workflow.steps.length).toBeGreaterThanOrEqual(3)
      for (const step of workflow.steps) { expect(names.has(step.tool), step.tool).toBe(true); expect(step.outcome).toBeTruthy() }
      for (const field of ['name', 'goal', 'approval', 'failure', 'prompt'] as const) expect(workflow[field]).toBeTruthy()
    }
  })
  it('covers each requested goal and identifies interface-only actions', () => {
    expect(featurePrompts.map(prompt => prompt.goal)).toEqual(['Discover or search', 'Create', 'Inspect', 'Update', 'Transform', 'Compare', 'Refresh', 'Export or share', 'Approve or confirm', 'Recover from failure'])
    expect(featurePrompts.find(prompt => prompt.goal === 'Export or share')?.support).toContain('no export tool exists')
    expect(featurePrompts.find(prompt => prompt.goal === 'Approve or confirm')?.support).toContain('No separate approval tool exists')
  })
})
