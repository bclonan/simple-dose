import { describe, expect, it } from 'vitest'
import { clearDoseToolNames } from '../webmcp/definitions'
import { dynamicMedicationToolNames } from '../webmcp/dynamic'
import { explorerToolNames } from '../webmcp/explorer'
import { documentedWorkflows, featurePrompts } from './webmcp-workflows'

describe('documentation workflows', () => {
  it('documents complete chains using only canonical tools', () => {
    const names = new Set<string>([...clearDoseToolNames, ...dynamicMedicationToolNames, ...explorerToolNames])
    expect(documentedWorkflows.length).toBeGreaterThanOrEqual(5)
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
  it('stops checkout preparation for human review before reading any resulting order', () => {
    const workflow = documentedWorkflows.find(item => item.name === 'Fill checkout for human review')!
    expect(workflow.steps.map(step => step.tool)).toEqual(['view_cart', 'prepare_demo_checkout', 'get_order_status'])
    expect(workflow.steps[1]!.outcome).toContain('Stop here for human review. No order has been created.')
    expect(workflow.steps[2]!.uses).toContain('only after the person reviews the form, uses Place demo order and sees confirmation')
    expect(workflow.steps.some(step => step.tool === 'checkout_demo_order')).toBe(false)
    expect(workflow.approval).toContain('The agent does not place the order')
    expect(workflow.failure).toContain('Do not invent missing details')
    expect(featurePrompts.find(prompt => prompt.goal === 'Approve or confirm')?.support).toContain('prepare_demo_checkout')
  })
})
