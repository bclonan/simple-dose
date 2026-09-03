import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CopyButton from './CopyButton.vue'

afterEach(() => vi.unstubAllGlobals())

describe('documentation copy button', () => {
  it('copies the supplied text after a click and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mount(CopyButton, { props: { text: 'Read the current Drug Explorer state.' } })
    expect(wrapper.get('button').text()).toBe('Copy prompt')
    expect(writeText).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith('Read the current Drug Explorer state.')
    expect(wrapper.get('[role="status"]').text()).toBe('Copied.')
  })

  it('shows a manual-copy fallback on failure and can recover on the next click', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mount(CopyButton, { props: { text: '{"section":"workspace"}', label: 'Copy arguments' } })
    expect(wrapper.get('button').text()).toBe('Copy arguments')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('Copy unavailable. Select and copy the text above.')
    expect(wrapper.text()).not.toContain('Copied.')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('Copied.')
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('handles browsers without a clipboard API and uses updated text', async () => {
    vi.stubGlobal('navigator', {})
    const wrapper = mount(CopyButton, { props: { text: 'first' } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Copy unavailable.')
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await wrapper.setProps({ text: 'current' })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith('current')
  })
})
