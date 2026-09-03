import type { DemoAddress, PrescriptionStatus } from '../types/demo-db'

export interface DemoCheckoutInput {
  fullName: string
  address: DemoAddress
  prescriptionStatus: PrescriptionStatus
}

export const validateDemoCheckout = (input: DemoCheckoutInput): DemoCheckoutInput => {
  const text = (value: string | undefined, label: string, max: number): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Enter ${label}.`)
    if (value.trim().length > max) throw new Error(`${label} is too long.`)
    return value.trim()
  }
  const state = text(input.address?.state, 'a two-letter state code', 2).toUpperCase()
  const postalCode = text(input.address?.postalCode, 'a valid ZIP code', 10)
  if (!/^[A-Z]{2}$/.test(state)) throw new Error('Enter a two-letter state code.')
  if (!/^[0-9]{5}(?:-[0-9]{4})?$/.test(postalCode)) throw new Error('Enter a valid ZIP code.')
  if (!['provider-will-send', 'request-prepared'].includes(input.prescriptionStatus)) throw new Error('Select a valid prescription status.')
  return {
    fullName: text(input.fullName, 'a full name', 100),
    address: {
      line1: text(input.address?.line1, 'a street address', 120),
      line2: input.address?.line2?.trim() ? text(input.address.line2, 'address line 2', 120) : undefined,
      city: text(input.address?.city, 'a city', 80), state, postalCode,
    },
    prescriptionStatus: input.prescriptionStatus,
  }
}
