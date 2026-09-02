import { demoDatabase } from '../data'
import type { AgentActivityContext } from '../types/demo-db'
import { useCartStore } from '../stores/cart.store'
import { useOrderStore } from '../stores/order.store'
import { usePricingStore } from '../stores/pricing.store'
import { useSelectionStore } from '../stores/selection.store'

export const captureWebMcpContext = (): AgentActivityContext => {
  const cart = useCartStore()
  const orders = useOrderStore()
  const pricing = usePricingStore()
  const selection = useSelectionStore()
  const currentOrder = orders.currentOrder

  return {
    route: typeof window === 'undefined' ? '/' : window.location.pathname,
    pricingScenario: {
      id: pricing.scenarioId,
      label: pricing.scenarioLabel,
      effectiveAt: pricing.currentScenario?.effectiveAt ?? demoDatabase.metadata.updatedAt,
    },
    selection: {
      medicationId: selection.medicationId,
      skuId: selection.skuId,
      offerId: selection.offerId,
      deliveryOptionId: selection.deliveryOptionId,
      form: selection.form,
      strength: selection.strength,
      quantity: selection.quantity,
    },
    cart: {
      itemCount: cart.itemCount,
      itemIds: cart.items.slice(0, 10).map((item) => item.id),
      offerIds: cart.items.slice(0, 10).map((item) => item.offerId),
      medicationSubtotal: cart.medicationSubtotal,
      deliveryTotal: cart.deliveryTotal,
      grandTotal: cart.grandTotal,
    },
    currentOrder: currentOrder
      ? {
          orderId: currentOrder.id,
          status: currentOrder.status,
          itemCount: currentOrder.items.length,
          total: currentOrder.total,
        }
      : null,
  }
}
