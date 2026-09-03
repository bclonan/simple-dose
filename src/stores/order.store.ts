import { defineStore } from 'pinia'
import { validateDemoCheckout, type DemoCheckoutInput } from '../domain/checkout'
import type { DemoOrder } from '../types/demo-db'
import { createDisplayId } from '../utils/ids'
import { readStorage, storageKeys, writeStorage } from '../utils/storage'
import { useCartStore } from './cart.store'

interface OrderState {
  orders: DemoOrder[]
  currentOrderId: string | null
}

export type CheckoutInput = DemoCheckoutInput

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
      if (!cart.readyForCheckout) throw new Error(cart.checkoutIssueMessage)
      const validated = validateDemoCheckout(input)

      const order: DemoOrder = {
        id: createDisplayId('CD', this.orders.length + 1),
        createdAt: new Date().toISOString(),
        status: 'demo-order-created',
        items: cart.items.map((item) => ({ ...item })),
        fullName: validated.fullName,
        address: { ...validated.address },
        prescriptionStatus: validated.prescriptionStatus,
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
