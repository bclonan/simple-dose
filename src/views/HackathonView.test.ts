import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { demoVideoSegments } from '../content/demo-video-script'
import { projectLinks } from '../content/project'
import { clearDoseToolNames } from '../webmcp/definitions'
import { dynamicMedicationToolNames } from '../webmcp/dynamic'
import { explorerToolNames } from '../webmcp/explorer'
import HackathonView from './HackathonView.vue'

const setup = () => mount(HackathonView, { global: { stubs: { RouterLink: RouterLinkStub } } })

describe('hackathon overview', () => {
  it('renders one main landmark, restrained internal actions and all required sections', () => {
    const wrapper = setup()
    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.findAll('h1')).toHaveLength(1)
    for (const id of ['project', 'showcase', 'workflow-comparison', 'architecture', 'submission', 'demo-video', 'extend']) {
      expect(wrapper.find(`#${id}`).exists()).toBe(true)
    }
    expect(wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))).toEqual(['/drugs/explore', '/webmcp'])
    for (const link of wrapper.findAll('a[href^="#"]')) expect(wrapper.find(link.attributes('href')!).exists()).toBe(true)
  })

  it('does not claim video or this source release is published', () => {
    const wrapper = setup()
    const readiness = wrapper.get('#submission').text()
    expect(readiness).toContain('Not yet a complete submission')
    expect(readiness).toContain('Pending push')
    expect(readiness).toContain('Not published')
    expect(readiness).toContain('[YOUTUBE_URL]')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find(`a[href="${projectLinks.repositoryUrl}"]`).exists()).toBe(true)
    expect(wrapper.get('a[href="/LICENSE.txt"]').text()).toBe('MIT license')
    expect(wrapper.text()).toContain('Public facts, fictional commerce')
    expect(wrapper.text()).toContain('No diagnosis, treatment recommendation')
  })

  it('uses the shared script and canonical tool names without running any examples', () => {
    const wrapper = setup()
    const knownTools = new Set([...clearDoseToolNames, ...dynamicMedicationToolNames, ...explorerToolNames])
    for (const tool of wrapper.findAll('.hackathon-tool-list code')) expect(knownTools.has(tool.text())).toBe(true)
    for (const segment of demoVideoSegments) expect(wrapper.get('.hackathon-script').text()).toContain(segment.narration)
    expect(wrapper.get('#showcase').text()).toContain('These cards do not run tools')
    expect(wrapper.get('#architecture').text()).toContain('App.vue')
    expect(wrapper.get('#architecture').text()).toContain('IndexedDB')
  })
})
