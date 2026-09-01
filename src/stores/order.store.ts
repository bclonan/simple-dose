import { defineStore } from 'pinia'
import type { DemoAddress, DemoOrder, PrescriptionStatus } from '../types/demo-db'
import { createDisplayId } from '../utils/ids'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'
import { useCartStore } from './cart.store'

interface OrderState {
  orders: DemoOrder[]
  currentOrderId: string | null
}

export interface CheckoutInput {
  fullName: string
  address: DemoAddress
  prescriptionStatus: PrescriptionStatus
}

const validPostalCode = /^[0-9]{5}(?:-[0-9]{4})?$/

export const useOrderStore = defineStore('orders', {
  state: (): OrderState =>
    readStorage<OrderState>(storageKeys.orders, { orders: [], currentOrderId: null }),
  getters: {
    currentOrder(state): DemoOrder | null {
      return state.orders.find((order) => order.id === state.currentOrderId) ?? null
    },
    orderById: (state) => (id: string): DemoOrder | undefined =>
      state.orders.find((order) => order.id === id),
  },
  actions: {
    createOrder(input: CheckoutInput): DemoOrder {
      const cart = useCartStore()
      if (cart.items.length === 0) throw new Error('Your cart is empty.')
      if (!input.fullName.trim()) throw new Error('Enter a full name.')
      if (
        !input.address.line1.trim() ||
        !input.address.city.trim() ||
        !input.address.state.trim() ||
        !validPostalCode.test(input.address.postalCode.trim())
      ) {
        throw new Error('Enter a complete demo delivery address and a valid ZIP code.')
      }
      if (!['provider-will-send', 'request-prepared'].includes(input.prescriptionStatus)) {
        throw new Error('Select a valid prescription status.')
      }

      const order: DemoOrder = {
        id: createDisplayId('CD', this.orders.length + 1),
        createdAt: new Date().toISOString(),
        status: 'demo-order-created',
        items: cart.items.map((item) => ({ ...item })),
        fullName: input.fullName.trim(),
        address: { ...input.address },
        prescriptionStatus: input.prescriptionStatus,
        total: cart.grandTotal,
      }
      this.orders.push(order)
      this.currentOrderId = order.id
      this.persist()
      cart.clear()
      return order
    },
    reset(): void {
      this.orders = []
      this.currentOrderId = null
      this.persist()
    },
    persist(): void {
      writeStorage(storageKeys.orders, {
        orders: this.orders,
        currentOrderId: this.currentOrderId,
      })
    },
  },
})
