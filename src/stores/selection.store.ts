import { defineStore } from 'pinia'
import { useCatalogStore } from './catalog.store'
import { findExactSku } from '../domain/catalog'
import type { MedicationSelection } from '../types/demo-db'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'

interface SelectionState {
  medicationId: string | null
  form: string | null
  strength: string | null
  quantity: number | null
  skuId: string | null
  offerId: string | null
  deliveryOptionId: string | null
  maxDeliveryDays: number | null
}

const emptySelection: SelectionState = {
  medicationId: null,
  form: null,
  strength: null,
  quantity: null,
  skuId: null,
  offerId: null,
  deliveryOptionId: null,
  maxDeliveryDays: null,
}

export const useSelectionStore = defineStore('selection', {
  state: (): SelectionState => ({
    ...emptySelection,
    ...readStorage<SelectionState>(storageKeys.selection, { ...emptySelection }),
  }),
  getters: {
    completeSelection(state): MedicationSelection | null {
      if (!state.medicationId || !state.skuId || !state.offerId || !state.deliveryOptionId) {
        return null
      }
      return {
        medicationId: state.medicationId,
        skuId: state.skuId,
        offerId: state.offerId,
        deliveryOptionId: state.deliveryOptionId,
      }
    },
  },
  actions: {
    initializeMedication(medicationId: string): void {
      const catalog = useCatalogStore()
      const medication = catalog.medicationById(medicationId)
      if (!medication) throw new Error('Medication was not found.')

      const configurations = catalog.skusForMedication(medicationId)
      const preference = (sku: typeof configurations[number]) =>
        (sku.strength === '20 mg' ? 4 : 0) +
        (sku.quantity === 90 ? 2 : 0) +
        (sku.form === medication.forms[0] ? 1 : 0)
      const preferred = [...configurations].sort((left, right) => preference(right) - preference(left))[0]
      if (!preferred) {
        throw new Error('This medication has no available configurations.')
      }

      this.setConfiguration({
        medicationId,
        form: preferred.form,
        strength: preferred.strength,
        quantity: preferred.quantity,
      })
    },
    setConfiguration(input: {
      medicationId: string
      form: string
      strength: string
      quantity: number
    }): void {
      const catalog = useCatalogStore()
      const sku = findExactSku(catalog.skus, input)
      if (!sku) throw new Error('That exact medication configuration is unavailable.')

      const skuChanged = this.skuId !== sku.id
      this.medicationId = input.medicationId
      this.form = input.form
      this.strength = input.strength
      this.quantity = input.quantity
      this.skuId = sku.id
      if (skuChanged) {
        this.offerId = null
        this.deliveryOptionId = null
        this.maxDeliveryDays = null
      }
      this.persist()
    },
    selectOption(offerId: string, deliveryOptionId: string): MedicationSelection {
      const catalog = useCatalogStore()
      const offer = catalog.offers.find((candidate) => candidate.id === offerId)
      if (!offer?.available) throw new Error('That fulfillment offer is unavailable.')
      const delivery = offer.deliveryOptions.find((candidate) => candidate.id === deliveryOptionId)
      if (!delivery) throw new Error('That delivery option is unavailable for this offer.')
      const sku = catalog.skuById(offer.skuId)
      if (!sku) throw new Error('The offer references an unavailable medication configuration.')

      if (this.skuId !== sku.id) this.maxDeliveryDays = null
      this.medicationId = sku.medicationId
      this.form = sku.form
      this.strength = sku.strength
      this.quantity = sku.quantity
      this.skuId = sku.id
      this.offerId = offer.id
      this.deliveryOptionId = delivery.id
      this.persist()
      return this.completeSelection as MedicationSelection
    },
    setDeliveryLimit(maximum: number | null): void {
      if (maximum !== null && (!Number.isInteger(maximum) || maximum < 0 || maximum > 30)) {
        throw new Error('Maximum delivery days must be a whole number from 0 to 30, or any delivery time.')
      }
      this.maxDeliveryDays = maximum
      this.persist()
    },
    reset(): void {
      Object.assign(this, emptySelection)
      this.persist()
    },
    persist(): void {
      writeStorage(storageKeys.selection, {
        medicationId: this.medicationId,
        form: this.form,
        strength: this.strength,
        quantity: this.quantity,
        skuId: this.skuId,
        offerId: this.offerId,
        deliveryOptionId: this.deliveryOptionId,
        maxDeliveryDays: this.maxDeliveryDays,
      } satisfies SelectionState)
    },
  },
})
