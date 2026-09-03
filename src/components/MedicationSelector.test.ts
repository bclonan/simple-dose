import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MedicationSelector from './MedicationSelector.vue'

describe('medication configuration selector', () => {
  it('displays source form labels readably but emits the exact SKU value', async () => {
    const wrapper = mount(MedicationSelector, { props: {
      forms: ['TABLET, FILM COATED'], strengths: ['10 mg/1'], quantities: [30],
      form: 'TABLET, FILM COATED', strength: '10 mg/1', quantity: 30, demo: true,
      notice: 'Fictional shopping configuration. This pairing is not verified by a public product record.',
    } })
    const form = wrapper.findAll('fieldset')[0]!.get('button')
    expect(form.text()).toBe('Tablet, film coated')
    expect(form.attributes('aria-pressed')).toBe('true')
    await form.trigger('click')
    expect(wrapper.emitted('selectForm')).toEqual([['TABLET, FILM COATED']])
    expect(wrapper.text()).toContain('Demo configuration')
    expect(wrapper.text()).toContain('This pairing is not verified')
  })

  it('shows explicit empty options and offers no invented configuration', () => {
    const wrapper = mount(MedicationSelector, { props: { forms: [], strengths: [], quantities: [], form: '', strength: '', quantity: 0 } })
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.findAll('.medication-selector__empty')).toHaveLength(3)
  })
})
