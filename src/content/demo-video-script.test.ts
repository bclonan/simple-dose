import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { clearDoseToolNames } from '../webmcp/definitions'
import { dynamicMedicationToolNames } from '../webmcp/dynamic'
import { explorerToolNames } from '../webmcp/explorer'
import { demoVideoDurationSeconds, demoVideoScriptText, demoVideoSegments } from './demo-video-script'

describe('shared narrated demo script', () => {
  it('fits the six requested segments and an under-three-minute spoken pace', () => {
    expect(demoVideoSegments.map(segment => segment.durationSeconds)).toEqual([15, 20, 70, 30, 20, 15])
    expect(demoVideoSegments.map(segment => segment.time)).toEqual(['0:00 to 0:15', '0:15 to 0:35', '0:35 to 1:45', '1:45 to 2:15', '2:15 to 2:35', '2:35 to 2:50'])
    expect(demoVideoSegments.reduce((total, segment) => total + segment.durationSeconds, 0)).toBe(demoVideoDurationSeconds)
    expect(demoVideoDurationSeconds).toBe(170)
    const words = demoVideoSegments.reduce((total, segment) => total + segment.narration.split(/\s+/).length, 0)
    expect(words / (demoVideoDurationSeconds / 60)).toBeGreaterThanOrEqual(130)
    expect(words / (demoVideoDurationSeconds / 60)).toBeLessThanOrEqual(150)
  })

  it('keeps all narration, screen actions and results synchronized with the saved markdown', () => {
    const markdown = readFileSync('docs/demo-video-script.md', 'utf8')
    for (const segment of demoVideoSegments) {
      expect(markdown).toContain(`## ${segment.time}`)
      expect(markdown).toContain(`> ${segment.narration}`)
      expect(markdown).toContain(segment.screenAction)
      expect(markdown).toContain(segment.expectedResult)
      expect(demoVideoScriptText).toContain(segment.narration)
    }
  })

  it('references only canonical tools and never scripts automatic checkout', () => {
    const names = new Set([...clearDoseToolNames, ...dynamicMedicationToolNames, ...explorerToolNames])
    for (const tool of demoVideoSegments.flatMap(segment => segment.tools)) expect(names.has(tool)).toBe(true)
    expect(demoVideoSegments.flatMap(segment => segment.tools)).not.toContain('checkout_demo_order')
    expect(demoVideoSegments[2]?.screenAction).toContain('without cuts')
  })
})
