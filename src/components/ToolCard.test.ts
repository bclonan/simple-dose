import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { clearDoseToolCatalog } from '../webmcp/definitions'
import { createToolDocumentation } from '../webmcp/documentation'
import ToolCard from './ToolCard.vue'

const documented = (name: string) => createToolDocumentation([clearDoseToolCatalog.find(tool => tool.name === name)!])[0]!

describe('tool documentation card', () => {
  it('shows the canonical identity and all documentation fields in native disclosure controls', async () => {
    const tool = documented('search_medications')
    const wrapper = mount(ToolCard, { props: { tool } })
    expect(wrapper.attributes('id')).toBe('tool-search_medications')
    expect(wrapper.attributes('data-testid')).toBe('tool-card-search_medications')
    expect(wrapper.get('h3').text()).toBe(tool.title)
    expect(wrapper.get('.tag').text()).toBe('mutating')
    expect(wrapper.text()).toContain(tool.description)
    expect(wrapper.text()).toContain('Example arguments pass the current schema.')
    expect(wrapper.findAll('summary').map(summary => summary.text())).toEqual([
      'Arguments and input schema', 'Schema sent to the browser', 'Example arguments and result', 'State, errors and source', 'Prompt and shortcuts',
    ])
    expect(wrapper.findAll('details').every(detail => !detail.element.open)).toBe(true)
    for (const detail of wrapper.findAll('details')) {
      await detail.get('summary').trigger('click')
      expect(detail.element.open).toBe(true)
    }
    expect(wrapper.text()).toContain('Required: query')
    expect(wrapper.text()).toContain('Optional: form, strength, offset, limit')
    const blocks = wrapper.findAll('pre').map(block => block.text())
    expect(blocks).toContain(JSON.stringify(tool.inputSchema, null, 2))
    expect(blocks).toContain(JSON.stringify(tool.nativeSchema, null, 2))
    expect(blocks).toContain(JSON.stringify(tool.exampleInput, null, 2))
    expect(blocks).toContain(JSON.stringify(tool.exampleResult, null, 2))
    expect(wrapper.text()).toContain('Representative result, not a live response')
    expect(wrapper.text()).toContain(tool.prompt)
    expect(wrapper.text()).toContain(tool.sourceModule)
    expect(wrapper.text()).toContain('Registration lives in src/App.vue')
    for (const state of tool.stateAffected) expect(wrapper.text()).toContain(state)
    for (const error of tool.errors) {
      expect(wrapper.text()).toContain(error.condition)
      expect(wrapper.text()).toContain(error.recovery)
    }
    const labels = wrapper.findAll('button').map(button => button.text())
    expect(labels).toEqual(expect.arrayContaining(['Copy prompt', 'Copy arguments', 'Copy tool name', 'Preview example']))
    await wrapper.findAll('details')[0]!.get('summary').trigger('click')
    expect(wrapper.findAll('details')[0]!.element.open).toBe(false)
  })

  it('emits a preview request without executing a consequential tool', async () => {
    const execute = vi.fn()
    const tool = { ...documented('checkout_demo_order'), execute }
    const wrapper = mount(ToolCard, { props: { tool } })
    const preview = wrapper.findAll('button').find(button => button.text() === 'Preview example')!
    await preview.trigger('click')
    expect(wrapper.emitted('run')).toEqual([[tool]])
    expect(execute).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Run example')
  })

  it('labels safe reads and disables actions while running or when examples fail validation', async () => {
    const tool = documented('view_cart')
    const wrapper = mount(ToolCard, { props: { tool } })
    const action = () => wrapper.findAll('button').at(-1)!
    expect(action().text()).toBe('Run example')
    await wrapper.setProps({ running: true })
    expect(action().text()).toBe('Running...')
    expect(action().attributes('disabled')).toBeDefined()
    await wrapper.setProps({ running: false, tool: { ...tool, validationErrors: ['arguments.limit must be at most 5.'] } })
    expect(action().attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Example needs review: arguments.limit must be at most 5.')
  })
})
