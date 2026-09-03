import { defineStore } from 'pinia'
import { validateDemoCheckout, type DemoCheckoutInput } from '../domain/checkout'
import type { PrescriptionStatus } from '../types/demo-db'

// Form drafts stay in memory. Never persist recipient details or include them in receipts.
const emptyForm = () => ({ fullName: '', line1: '', line2: '', city: '', state: '', postalCode: '', prescriptionStatus: 'provider-will-send' as PrescriptionStatus })

export const useCheckoutStore = defineStore('checkout', {
  state: () => ({ form: emptyForm(), prepared: false }),
  actions: {
    prepare(input: DemoCheckoutInput): void {
      const validated = validateDemoCheckout(input)
      Object.assign(this.form, { fullName: validated.fullName, ...validated.address, line2: validated.address.line2 ?? '', prescriptionStatus: validated.prescriptionStatus })
      this.prepared = true
    },
    reset(): void {
      Object.assign(this.form, emptyForm())
      this.prepared = false
    },
  },
})
