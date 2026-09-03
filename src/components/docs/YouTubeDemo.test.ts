import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import YouTubeDemo from './YouTubeDemo.vue'

describe('YouTube demo', () => {
  it('keeps the missing video explicit without loading a frame', () => {
    const wrapper = mount(YouTubeDemo, { props: { url: '' } })
    expect(wrapper.get('[data-testid="youtube-placeholder"]').text()).toContain('Public demo video pending')
    expect(wrapper.text()).toContain('[YOUTUBE_URL]')
    expect(wrapper.text()).toContain('not a published video')
    expect(wrapper.find('iframe').exists()).toBe(false)
  })

  it('uses only a privacy-enhanced, non-autoplay frame for a valid configured video', () => {
    const wrapper = mount(YouTubeDemo, { props: { url: 'https://www.youtube.com/watch?v=abcdefghijk&autoplay=1' } })
    const iframe = wrapper.get('iframe')
    expect(iframe.attributes('src')).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk')
    expect(iframe.attributes('title')).toBe('ClearDose narrated WebMCP demonstration')
    expect(iframe.attributes('loading')).toBe('lazy')
    expect(iframe.attributes('allow')).not.toContain('autoplay')
    expect(iframe.attributes()).toHaveProperty('allowfullscreen')
    expect(wrapper.find('[data-testid="youtube-placeholder"]').exists()).toBe(false)
  })

  it.each(['https://evil.example/embed/abcdefghijk', 'javascript:alert(1)', 'https://youtube.com.evil.example/watch?v=abcdefghijk', 'https://user:secret@youtube.com/watch?v=abcdefghijk', 'https://youtu.be/short'])('does not turn an invalid video URL into an iframe: %s', url => {
    const wrapper = mount(YouTubeDemo, { props: { url } })
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('[data-testid="youtube-placeholder"]').exists()).toBe(true)
  })
})
