import { defineStore } from 'pinia'
import type { PrescriptionRequest } from '../types/demo-db'
import { createDisplayId } from '../utils/ids'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'
import { useCatalogStore } from './catalog.store'
import { usePricingStore } from './pricing.store'

interface PrescriptionState {
  latestRequest: PrescriptionRequest | null
}

export interface CreatePrescriptionInput {
  medicationId: string
  form: string
  strength: string
  quantity: number
  offerId: string
  deliveryOptionId: string
  patientName?: string
  dateOfBirth?: string
  prescriberName?: string
  practice?: string
}

export const usePrescriptionStore = defineStore('prescription', {
  state: (): PrescriptionState =>
    readStorage<PrescriptionState>(storageKeys.prescription, { latestRequest: null }),
  actions: {
    createRequest(input: CreatePrescriptionInput): PrescriptionRequest {
      const catalog = useCatalogStore()
      const pricing = usePricingStore()
      const medication = catalog.medicationById(input.medicationId)
      if (!medication) throw new Error('Medication was not found.')

      const sku = catalog.skus.find(
        (candidate) =>
          candidate.medicationId === input.medicationId &&
          candidate.form === input.form &&
          candidate.strength === input.strength &&
          candidate.quantity === input.quantity,
      )
      if (!sku) throw new Error('That exact medication configuration is unavailable.')

      const offer = catalog.offers.find(
        (candidate) => candidate.id === input.offerId && candidate.skuId === sku.id,
      )
      if (!offer?.available) throw new Error('That fulfillment offer is unavailable.')
      const delivery = offer.deliveryOptions.find(
        (candidate) => candidate.id === input.deliveryOptionId,
      )
      if (!delivery) throw new Error('That delivery option is unavailable for this offer.')

      const existingSequence = this.latestRequest ? 2 : 1
      const request: PrescriptionRequest = {
        id: createDisplayId('PR', existingSequence),
        createdAt: new Date().toISOString(),
        medicationId: medication.id,
        skuId: sku.id,
        offerId: offer.id,
        deliveryOptionId: delivery.id,
        pharmacyId: offer.pharmacyId,
        estimatedTotal:
          pricing.pricingForOffer(offer).medicationSubtotal + delivery.price,
        patientName: input.patientName?.trim() || undefined,
        dateOfBirth: input.dateOfBirth || undefined,
        prescriberName: input.prescriberName?.trim() || undefined,
        practice: input.practice?.trim() || undefined,
        status: 'prepared',
      }
      this.latestRequest = request
      this.persist()
      return request
    },
    reset(): void {
      this.latestRequest = null
      this.persist()
    },
    persist(): void {
      writeStorage(storageKeys.prescription, { latestRequest: this.latestRequest })
    },
  },
})
