import { describe, expect, it } from 'vitest'

import {
  groupWebMcpJourneys,
  replayEntriesForJourney,
} from '../../src/components/webmcpJourneys'
import type { AgentActivity } from '../../src/types/demo-db'

const entry = (
  id: string,
  journeyId: string,
  toolName: string,
  timestamp: string,
  input: unknown = {},
): AgentActivity => ({
  id,
  journeyId,
  journeyTitle: journeyId === 'journey-a' ? 'First journey' : 'Second journey',
  timestamp,
  source: 'agent',
  type: 'tool',
  toolName,
  status: 'success',
  input,
  outputSummary: { ok: true },
  durationMs: 5,
})

describe('recent WebMCP journey acceptance', () => {
  it('keeps explicitly correlated journeys separate even when calls happen seconds apart', () => {
    const journeys = groupWebMcpJourneys([
      entry(
        'activity-a',
        'journey-a',
        'search_medications',
        '2026-08-31T16:00:00.000Z',
      ),
      entry(
        'activity-b',
        'journey-b',
        'compare_cart_savings',
        '2026-08-31T16:00:01.000Z',
      ),
    ])

    expect(journeys).toHaveLength(2)
    expect(journeys.map((journey) => journey.entries.map((item) => item.journeyId))).toEqual([
      ['journey-b'],
      ['journey-a'],
    ])
  })

  it('strips redacted identity fields before building replay arguments', () => {
    const [journey] = groupWebMcpJourneys([
      entry(
        'activity-prescription',
        'journey-a',
        'create_prescription_request_card',
        '2026-08-31T16:00:00.000Z',
        {
          offerId: 'offer-atorvastatin-20-90-cleardose',
          deliveryOptionId: 'standard',
          patientName: 'Demo Patient',
          prescriberName: 'Demo Prescriber',
          nested: { address: '100 Demo Street', harmless: 'kept' },
        },
      ),
    ])

    expect(journey?.replayable).toBe(true)
    expect(replayEntriesForJourney(journey!)[0]?.input).toEqual({
      offerId: 'offer-atorvastatin-20-90-cleardose',
      deliveryOptionId: 'standard',
      nested: { harmless: 'kept' },
    })
  })

  it('never marks a recorded checkout journey as replayable', () => {
    const [journey] = groupWebMcpJourneys([
      entry(
        'activity-checkout',
        'journey-a',
        'checkout_demo_order',
        '2026-08-31T16:00:00.000Z',
        {
          fullName: 'Demo User',
          address: { line1: '100 Demo Street', postalCode: '21201' },
          prescriptionStatus: 'provider-will-send',
        },
      ),
    ])

    expect(journey).toMatchObject({
      replayable: false,
      replayBlockedReason: expect.stringMatching(/human-controlled|never replayed/i),
    })
  })

  it('blocks an oversized journey instead of silently replaying only its first calls', () => {
    const entries = Array.from({ length: 13 }, (_, index) =>
      entry(
        `activity-${index}`,
        'journey-a',
        'get_medication_details',
        new Date(Date.parse('2026-08-31T16:00:00.000Z') + index * 1000).toISOString(),
        { medicationId: 'med-atorvastatin' },
      ),
    )
    const [journey] = groupWebMcpJourneys(entries)

    expect(journey).toMatchObject({
      replayable: false,
      replayBlockedReason: expect.stringMatching(/12|limit|too many/i),
    })
  })
})
