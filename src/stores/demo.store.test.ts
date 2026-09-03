import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCheckoutStore } from './checkout.store'
import { useDemoStore } from './demo.store'
import { storageKeys } from '../utils/storage'

const persistedClearDoseData = (): string => Object.values(storageKeys)
  .map(key => localStorage.getItem(key) ?? '')
  .join('')

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('demo reset privacy', () => {
  it('clears the current checkout draft while preserving its mounted form reference', () => {
    const checkout = useCheckoutStore()
    const form = checkout.form
    checkout.prepare({
      fullName: 'Fictional Draft Recipient',
      address: { line1: '42 Demo Avenue', line2: 'Unit 2', city: 'Baltimore', state: 'MD', postalCode: '21201' },
      prescriptionStatus: 'provider-will-send',
    })
    expect(checkout.prepared).toBe(true)
    expect(form.fullName).toBe('Fictional Draft Recipient')
    expect(persistedClearDoseData()).not.toContain('Fictional Draft Recipient')

    useDemoStore().resetAll()

    expect(checkout.form).toBe(form)
    expect(checkout.prepared).toBe(false)
    expect(form).toEqual({ fullName: '', line1: '', line2: '', city: '', state: '', postalCode: '', prescriptionStatus: 'provider-will-send' })
    expect(persistedClearDoseData()).not.toContain('Fictional Draft Recipient')
  })
})
