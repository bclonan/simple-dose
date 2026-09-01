<script setup lang="ts">
import { computed, ref } from 'vue'
import DemoPromptCard from '../components/DemoPromptCard.vue'
import DemoReplay, { type ReplayStep } from '../components/DemoReplay.vue'
import DemoScenarioSwitch from '../components/DemoScenarioSwitch.vue'
import ToolCard from '../components/ToolCard.vue'
import ToolLog from '../components/ToolLog.vue'
import WebMCPStatus from '../components/WebMCPStatus.vue'
import { executeWithActivity, useClearDoseActions } from '../services/cleardose.actions'
import { useCartStore } from '../stores/cart.store'
import { useOrderStore } from '../stores/order.store'
import { usePricingStore } from '../stores/pricing.store'
import { useSelectionStore } from '../stores/selection.store'
import { useWebMcpStore } from '../stores/webmcp.store'
import {
  clearDoseToolCatalog,
  createClearDoseToolDefinitions,
} from '../webmcp/definitions'
import { executeTool, getModelContext } from '../webmcp/support'
import type {
  ClearDoseToolCategory,
  ClearDoseToolDescriptor,
  JsonValue,
} from '../webmcp/types'

const actions = useClearDoseActions()
const webmcp = useWebMcpStore()
const selection = useSelectionStore()
const pricing = usePricingStore()
const cart = useCartStore()
const orders = useOrderStore()
const copyStatus = ref('')
const runningTool = ref<string | null>(null)
const activeReplay = ref<string | null>(null)
const replayState = ref<'idle' | 'running' | 'complete' | 'error'>('idle')
const replayTitle = ref('')
const replaySteps = ref<ReplayStep[]>([])

const prompts = [
  {
    id: 'find-compare',
    title: 'Find + compare',
    prompt: 'Find atorvastatin 20 mg tablets, quantity 90. Compare all fulfillment options and tell me the cheapest total arriving within five days.',
  },
  {
    id: 'prescription-request',
    title: 'Prescription request',
    prompt: 'Find atorvastatin 20 mg, quantity 90, choose the lowest-cost option arriving within five days, and prepare a prescription request card.',
  },
  {
    id: 'checkout',
    title: 'Checkout',
    prompt: 'Add the selected medication to my cart, use standard delivery, and show me what is needed to complete demo checkout.',
  },
  {
    id: 'price-changed',
    title: 'Price changed',
    prompt: 'Prices changed. Recompare my selected medication and tell me whether my current fulfillment option is still the cheapest delivered within five days.',
  },
]

const webMcpUseCases = [
  {
    title: 'Find exact catalog facts',
    when: 'Use tools when a user names a medication, brand, form, or strength and the agent needs structured catalog IDs.',
    chain: 'search_medications → get_medication_details',
  },
  {
    title: 'Compare without guessing',
    when: 'Use tools when price, delivery, and timing depend on one exact form, strength, and quantity.',
    chain: 'compare_fulfillment_options → select_medication_option',
  },
  {
    title: 'Complete a visible workflow',
    when: 'Use tools when the same action already exists in the interface and the human can see the resulting request, cart, or order.',
    chain: 'create_prescription_request_card → add_to_cart → checkout_demo_order',
  },
  {
    title: 'Recover from a bad step',
    when: 'Use tools when an agent needs current IDs, valid alternatives, and one safe undo instead of retrying blindly.',
    chain: 'view_cart → set_delivery_option or remove_cart_item',
  },
]

const addToolChecklist = [
  'Start with one user goal and the exact initial state the tool needs.',
  'Expose one product action. Avoid a second tool that chooses and executes the same step.',
  'Use typed fields and enums, then validate every constraint again in code.',
  'Call the shared ClearDose action so the interface and tool cannot disagree.',
  'Return only what the next step needs, stay under the output budget, and name a recovery action.',
  'Add direct, ambiguous, ordered-chain, and mid-chain failure evals before release.',
]

const categories: { id: ClearDoseToolCategory; label: string; description: string }[] = [
  { id: 'discovery', label: 'Discovery', description: 'Find and inspect catalog records.' },
  { id: 'pricing', label: 'Pricing', description: 'Compare one exact SKU and save a choice.' },
  { id: 'prescription', label: 'Prescription', description: 'Prepare a local request summary.' },
  { id: 'commerce', label: 'Commerce', description: 'Manage the simulated cart and order.' },
]

const groupedTools = computed(() =>
  categories.map((category) => ({
    ...category,
    tools: clearDoseToolCatalog.filter((tool) => tool.category === category.id),
  })),
)

const fallbackDefinitions = computed(() => createClearDoseToolDefinitions(actions, 'demo'))

const lowestFlagshipOption = async () => {
  const comparison = await actions.compareFulfillmentOptions(flagship)
  const best = comparison.options.find((option) => option.optionId === comparison.lowestTotalOptionId)
  if (!best) throw new Error('No eligible fulfillment option was found.')
  return best
}

const ensureCartItem = async () => {
  const existing = cart.detailedItems[0]
  if (existing) return existing
  const best = await lowestFlagshipOption()
  actions.addToCart({ offerId: best.offerId, deliveryOptionId: best.deliveryOptionId })
  const added = cart.detailedItems[0]
  if (!added) throw new Error('The demo cart could not be prepared.')
  return added
}

const ensureDemoOrder = async (): Promise<void> => {
  if (orders.currentOrder) return
  await ensureCartItem()
  await actions.checkoutDemoOrder({
    fullName: 'Demo User',
    address: {
      line1: '100 Demo Street',
      city: 'Baltimore',
      state: 'MD',
      postalCode: '21201',
    },
    prescriptionStatus: 'provider-will-send',
  })
}

const exampleInputFor = async (
  tool: ClearDoseToolDescriptor,
): Promise<Record<string, JsonValue>> => {
  if (['select_medication_option', 'create_prescription_request_card', 'add_to_cart'].includes(tool.name)) {
    const best = await lowestFlagshipOption()
    return { offerId: best.offerId, deliveryOptionId: best.deliveryOptionId }
  }
  if (tool.name === 'view_cart') return {}
  if (tool.name === 'remove_cart_item') {
    const line = await ensureCartItem()
    return { cartItemId: line.item.id }
  }
  if (tool.name === 'set_delivery_option') {
    const line = await ensureCartItem()
    const delivery = line.offer.deliveryOptions.find((option) => option.id === 'express')
      ?? line.offer.deliveryOptions[0]
    if (!delivery) throw new Error('No delivery option is available for the demo cart item.')
    return { cartItemId: line.item.id, deliveryOptionId: delivery.id }
  }
  if (tool.name === 'checkout_demo_order') {
    await ensureCartItem()
  }
  if (tool.name === 'get_order_status') {
    await ensureDemoOrder()
    return {}
  }
  return tool.exampleInput
}

const copyPrompt = async (prompt: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(prompt)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = prompt
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
  copyStatus.value = 'Prompt copied.'
  window.setTimeout(() => (copyStatus.value = ''), 1800)
}

const runExample = async (tool: ClearDoseToolDescriptor): Promise<void> => {
  if (runningTool.value) return
  runningTool.value = tool.name
  try {
    const exampleInput = await exampleInputFor(tool)
    const context = getModelContext()
    if (webmcp.canExecuteNatively(tool.name) && context?.getTools && context.executeTool) {
      await executeTool(tool.name, exampleInput)
    } else {
      const definition = fallbackDefinitions.value.find((candidate) => candidate.name === tool.name)
      if (!definition) throw new Error('Tool definition was not found.')
      await definition.execute(exampleInput)
    }
  } finally {
    runningTool.value = null
  }
}

const pause = async (): Promise<void> => {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 260))
}

const markStep = (index: number, status: ReplayStep['status']): void => {
  const step = replaySteps.value[index]
  if (step) step.status = status
}

const runReplayStep = async <T>(
  index: number,
  toolName: string,
  args: unknown,
  run: () => T | Promise<T>,
): Promise<T> => {
  markStep(index, 'running')
  await pause()
  try {
    const output = await executeWithActivity({ toolName, source: 'demo', args, run })
    markStep(index, 'complete')
    return output
  } catch (error) {
    markStep(index, 'error')
    throw error
  }
}

const flagship = {
  medicationId: 'med-atorvastatin',
  form: 'tablet',
  strength: '20 mg',
  quantity: 90,
  maxDeliveryDays: 5,
}

const setReplaySteps = (names: Array<[string, string]>): void => {
  replaySteps.value = names.map(([name, label]) => ({ name, label, status: 'pending' }))
}

const runReplay = async (id: string): Promise<void> => {
  if (activeReplay.value) return
  activeReplay.value = id
  replayState.value = 'running'
  replayTitle.value = prompts.find((prompt) => prompt.id === id)?.title ?? 'ClearDose replay'

  try {
    if (id === 'find-compare' || id === 'prescription-request') {
      setReplaySteps([
        ['search_medications', 'Search the medication catalog'],
        ['get_medication_details', 'Read available configurations'],
        ['compare_fulfillment_options', 'Compare the exact 20 mg, 90-count SKU'],
        ...(id === 'prescription-request'
          ? [
              ['select_medication_option', 'Select the lowest eligible total'] as [string, string],
              ['create_prescription_request_card', 'Prepare the local request card'] as [string, string],
            ]
          : []),
      ])
      await runReplayStep(0, 'search_medications', { query: 'atorvastatin' }, () =>
        actions.searchMedications({ query: 'atorvastatin' }),
      )
      await runReplayStep(1, 'get_medication_details', { medicationId: flagship.medicationId }, () =>
        actions.getMedicationDetails({ medicationId: flagship.medicationId }),
      )
      const comparison = await runReplayStep(
        2,
        'compare_fulfillment_options',
        flagship,
        () => actions.compareFulfillmentOptions(flagship),
      )
      if (id === 'prescription-request') {
        const best = comparison.options.find((option) => option.optionId === comparison.lowestTotalOptionId)
        if (!best) throw new Error('No eligible fulfillment option was found.')
        await runReplayStep(3, 'select_medication_option', best, () =>
          actions.selectMedicationOption({
            offerId: best.offerId,
            deliveryOptionId: best.deliveryOptionId,
          }),
        )
        await runReplayStep(4, 'create_prescription_request_card', best, () =>
          actions.createPrescriptionRequestCard({
            offerId: best.offerId,
            deliveryOptionId: best.deliveryOptionId,
          }),
        )
      }
    } else if (id === 'checkout') {
      setReplaySteps([
        ['select_medication_option', 'Confirm a standard delivery option'],
        ['add_to_cart', 'Add the exact selection to the cart'],
        ['view_cart', 'Read the simulated checkout total'],
      ])
      let offerId = selection.offerId
      let deliveryOptionId = selection.deliveryOptionId
      if (!offerId || !deliveryOptionId) {
        const comparison = await actions.compareFulfillmentOptions(flagship)
        const standard = comparison.options.find(
          (option) => option.deliveryOptionId === 'standard' && option.optionId === comparison.lowestTotalOptionId,
        ) ?? comparison.options.find((option) => option.deliveryOptionId === 'standard')
        if (!standard) throw new Error('No standard delivery option was found.')
        offerId = standard.offerId
        deliveryOptionId = standard.deliveryOptionId
      }
      await runReplayStep(0, 'select_medication_option', { offerId, deliveryOptionId }, () =>
        actions.selectMedicationOption({ offerId: offerId as string, deliveryOptionId: deliveryOptionId as string }),
      )
      await runReplayStep(1, 'add_to_cart', { offerId, deliveryOptionId }, () =>
        actions.addToCart({ offerId: offerId as string, deliveryOptionId: deliveryOptionId as string }),
      )
      await runReplayStep(2, 'view_cart', {}, () => actions.viewCart())
    } else {
      setReplaySteps([
        ['compare_fulfillment_options', 'Record the current lowest total'],
        ['market-update', 'Apply the seeded market update'],
        ['compare_fulfillment_options', 'Recompute the lowest eligible total'],
      ])
      await runReplayStep(0, 'compare_fulfillment_options', flagship, () =>
        actions.compareFulfillmentOptions(flagship),
      )
      markStep(1, 'running')
      await pause()
      pricing.setScenario('market-update')
      markStep(1, 'complete')
      await runReplayStep(2, 'compare_fulfillment_options', { maxDeliveryDays: 5 }, () =>
        actions.compareFulfillmentOptions({ maxDeliveryDays: 5 }),
      )
    }
    replayState.value = 'complete'
  } catch {
    replayState.value = 'error'
  } finally {
    activeReplay.value = null
  }
}

const resetReplay = (): void => {
  replayState.value = 'idle'
  replaySteps.value = []
  replayTitle.value = ''
  cart.closeDrawer()
}
</script>

<template>
  <main id="main-content" class="agent-lab-page">
    <section class="agent-lab-hero">
      <div class="container agent-lab-hero__grid">
        <div>
          <p class="eyebrow">ClearDose Agent Lab</p>
          <h1>See exactly what an agent can do inside ClearDose.</h1>
          <p>Each call runs the same local actions as the pharmacy interface. Watch the search, selection, request card, cart, and order state change.</p>
        </div>
        <div class="agent-lab-health">
          <WebMCPStatus />
          <div class="health-row"><span class="status-dot status-dot--ready" aria-hidden="true"></span><strong>Demo database loaded</strong><span>12 medications · 312 offers</span></div>
          <div class="health-row"><span class="status-dot status-dot--ready" aria-hidden="true"></span><strong>Pricing scenario</strong><span>{{ pricing.scenarioLabel }}</span></div>
        </div>
      </div>
    </section>

    <div class="container agent-lab-content">
      <section class="prompt-section" aria-labelledby="demo-prompts-title">
        <div class="section-heading section-heading--split">
          <div><p class="section-kicker">90-second paths</p><h2 id="demo-prompts-title">Try a demo prompt</h2></div>
          <span class="copy-status" aria-live="polite">{{ copyStatus }}</span>
        </div>
        <div class="prompt-grid">
          <DemoPromptCard
            v-for="prompt in prompts"
            :key="prompt.id"
            v-bind="prompt"
            :running="activeReplay === prompt.id"
            @copy="copyPrompt"
            @replay="runReplay"
          />
        </div>
      </section>

      <DemoReplay
        :title="replayTitle"
        :steps="replaySteps"
        :state="replayState"
        @reset="resetReplay"
      />

      <DemoScenarioSwitch />

      <section class="webmcp-strategy" aria-labelledby="webmcp-strategy-title">
        <div class="section-heading section-heading--split">
          <div>
            <p class="section-kicker">Tool strategy</p>
            <h2 id="webmcp-strategy-title">When WebMCP earns a place</h2>
          </div>
          <a href="https://developer.chrome.com/docs/ai/webmcp/use-cases" target="_blank" rel="noreferrer">Chrome use cases</a>
        </div>
        <div class="strategy-grid">
          <article v-for="useCase in webMcpUseCases" :key="useCase.title" class="strategy-card">
            <h3>{{ useCase.title }}</h3>
            <p>{{ useCase.when }}</p>
            <code>{{ useCase.chain }}</code>
          </article>
        </div>
        <div class="add-tool-guide">
          <div>
            <p class="section-kicker">Extension rule</p>
            <h3>Add a tool only when it closes a real journey gap</h3>
            <p>ClearDose added <code>remove_cart_item</code> because the interface could undo a bad cart choice and the agent could not. Broad context, navigation, and combined compare-and-buy tools stay out because they overlap existing capabilities.</p>
          </div>
          <ol>
            <li v-for="item in addToolChecklist" :key="item">{{ item }}</li>
          </ol>
        </div>
        <nav class="strategy-links" aria-label="Chrome WebMCP guidance">
          <a href="https://developer.chrome.com/docs/ai/webmcp/build-tools" target="_blank" rel="noreferrer">Build tools</a>
          <a href="https://developer.chrome.com/docs/ai/webmcp/best-practices" target="_blank" rel="noreferrer">Best practices</a>
          <a href="https://developer.chrome.com/docs/ai/webmcp/evals" target="_blank" rel="noreferrer">Evals</a>
          <a href="https://developer.chrome.com/docs/ai/webmcp/secure-tools" target="_blank" rel="noreferrer">Security</a>
        </nav>
      </section>

      <div class="agent-lab-grid">
        <section class="tools-explorer" aria-labelledby="registered-tools-title">
          <div class="section-heading">
            <p class="section-kicker">Registered tools</p>
            <h2 id="registered-tools-title">{{ clearDoseToolCatalog.length }} focused capabilities</h2>
            <p>The schemas are visible here, and each example really runs. Read tools inspect local state. State and write tools update the same data shown in the interface.</p>
          </div>

          <section v-for="group in groupedTools" :key="group.id" class="tool-group" :aria-labelledby="`tool-group-${group.id}`">
            <header><div><p class="section-kicker">{{ group.label }}</p><h3 :id="`tool-group-${group.id}`">{{ group.description }}</h3></div><span>{{ group.tools.length }}</span></header>
            <div class="tool-grid">
              <ToolCard
                v-for="tool in group.tools"
                :key="tool.name"
                :tool="tool"
                :running="runningTool === tool.name"
                @run="runExample"
              />
            </div>
          </section>
        </section>

        <ToolLog />
      </div>
    </div>
  </main>
</template>
