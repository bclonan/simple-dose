<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import DemoPromptCard from '../components/DemoPromptCard.vue'
import DemoReplay, { type ReplayStep } from '../components/DemoReplay.vue'
import DemoScenarioSwitch from '../components/DemoScenarioSwitch.vue'
import ToolCard from '../components/ToolCard.vue'
import ToolLog from '../components/ToolLog.vue'
import WebMCPStatus from '../components/WebMCPStatus.vue'
import ToolInspector from '../components/docs/ToolInspector.vue'
import AgentComparison from '../components/docs/AgentComparison.vue'
import WorkflowGuide from '../components/docs/WorkflowGuide.vue'
import CopyButton from '../components/docs/CopyButton.vue'
import { createToolDocumentation, type ToolDocumentation } from '../webmcp/documentation'
import { executeWithActivity, useClearDoseActions } from '../services/cleardose.actions'
import { useAgentActivityStore } from '../stores/agentActivity.store'
import { useCartStore } from '../stores/cart.store'
import { useCatalogStore } from '../stores/catalog.store'
import { usePricingStore } from '../stores/pricing.store'
import { useSelectionStore } from '../stores/selection.store'
import { useWebMcpStore } from '../stores/webmcp.store'
import {
  clearDoseToolCatalog,
  createClearDoseToolDefinitions,
} from '../webmcp/definitions'
import { executeTool, getModelContext } from '../webmcp/support'
import { createDynamicMedicationTools } from '../webmcp/dynamic'
import { useMedicationToolDependencies } from '../webmcp/medication-context'
import { useExplorerToolDependencies } from '../webmcp/explorer-context'
import { createExplorerTools } from '../webmcp/explorer'
import type {
  ClearDoseToolCategory,
} from '../webmcp/types'

const actions = useClearDoseActions()
const activity = useAgentActivityStore()
const webmcp = useWebMcpStore()
const selection = useSelectionStore()
const pricing = usePricingStore()
const cart = useCartStore()
const catalog = useCatalogStore()
const medicationDependencies = useMedicationToolDependencies()
const explorerDependencies = useExplorerToolDependencies()
const allTools = computed(() => [...clearDoseToolCatalog, ...createDynamicMedicationTools(medicationDependencies, 'demo'), ...createExplorerTools(explorerDependencies, 'demo')])
const documentation = computed(() => createToolDocumentation(allTools.value))
const previewDialog = ref<HTMLDialogElement | null>(null)
const previewTool = ref<ToolDocumentation | null>(null)
const pendingReplay = ref<string | null>(null)
const exampleStatus = ref('')
const copyStatus = ref('')
const runningTool = ref<string | null>(null)
const activeReplay = ref<string | null>(null)
const replayState = ref<'idle' | 'running' | 'complete' | 'error'>('idle')
const replayTitle = ref('')
const replaySteps = ref<ReplayStep[]>([])

const prompts = [
  {
    id: 'drug-explorer', title: 'Drug fact workspace',
    prompt: 'Compare Metformin and Jardiance in Drug Explorer. Show side effects and public pricing. Then only show their FDA-labeled interactions.',
  },
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
  {
    id: 'multi-cart-savings',
    title: 'Two-item savings',
    prompt: 'Add atorvastatin 20 mg and metformin 500 mg to my demo cart, then compare each exact SKU with its lowest current delivered total.',
  },
]

const webMcpUseCases = [
  {
    title: 'Build a shared fact workspace',
    when: 'Use workspace tools when the user wants to select medications, show facts, or change the comparison they see. Read current state before editing an existing card.',
    chain: 'cleardose_select_drugs → cleardose_show_drug_fact → cleardose_update_fact_card',
  },
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
    when: 'Use tools to prepare the same request, cart and checkout form the person sees. Stop at the filled form so the person can review it and use Place demo order.',
    chain: 'create_prescription_request_card → add_to_cart → prepare_demo_checkout → human review and Place demo order',
  },
  {
    title: 'Recover from a bad step',
    when: 'Use tools when an agent needs current IDs, valid alternatives, and one safe undo instead of retrying blindly.',
    chain: 'view_cart → set_delivery_option or remove_cart_item',
  },
  {
    title: 'Check a whole cart',
    when: 'Use tools after one or more exact medications are in the cart and the user wants current, item-level savings without changing anything.',
    chain: 'view_cart → compare_cart_savings',
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
    tools: documentation.value.filter((tool) => tool.category === category.id),
  })),
)

const fallbackDefinitions = computed(() => [...createClearDoseToolDefinitions(actions, 'demo'), ...createDynamicMedicationTools(medicationDependencies, 'demo'), ...createExplorerTools(explorerDependencies, 'demo')])

const copyPrompt = async (prompt: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(prompt)
    copyStatus.value = 'Prompt copied.'
  } catch {
    copyStatus.value = 'Copy unavailable. Select and copy the prompt text.'
  }
}

const closePreview = (): void => { previewDialog.value?.close(); previewTool.value = null; pendingReplay.value = null }
const runExample = async (tool: ToolDocumentation): Promise<void> => {
  if (runningTool.value) return
  if (!tool.safeToRun) {
    previewTool.value = tool
    pendingReplay.value = null
    await nextTick()
    previewDialog.value?.showModal()
    return
  }
  runningTool.value = tool.name
  try {
    const exampleInput = tool.exampleInput
    const context = getModelContext()
    if (webmcp.canExecuteNatively(tool.name) && context?.getTools && context.executeTool) {
      await executeTool(tool.name, exampleInput)
      exampleStatus.value = `${tool.name} completed through native WebMCP. See the saved result in the inspector.`
    } else {
      const definition = fallbackDefinitions.value.find((candidate) => candidate.name === tool.name)
      if (!definition) throw new Error('Tool definition was not found.')
      await definition.execute(exampleInput)
      exampleStatus.value = `${tool.name} completed through the local fallback, not native WebMCP. See the saved result in the inspector.`
    }
  } catch (error) {
    exampleStatus.value = error instanceof Error ? error.message : 'The example failed. Read current state before retrying.'
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

const secondMedication = {
  medicationId: 'med-metformin',
  form: 'tablet',
  strength: '500 mg',
  quantity: 90,
  maxDeliveryDays: 5,
}

const setReplaySteps = (names: Array<[string, string]>): void => {
  replaySteps.value = names.map(([name, label]) => ({ name, label, status: 'pending' }))
}

const requestReplay = async (id: string): Promise<void> => {
  if (id === 'drug-explorer' || activeReplay.value) return
  previewTool.value = null
  pendingReplay.value = id
  await nextTick()
  previewDialog.value?.showModal()
}
const confirmReplay = async (): Promise<void> => {
  const id = pendingReplay.value
  closePreview()
  if (id) await runReplay(id)
}
const runReplay = async (id: string): Promise<void> => {
  if (id === 'drug-explorer') return
  if (activeReplay.value) return
  catalog.setDataMode('demo')
  activeReplay.value = id
  replayState.value = 'running'
  replayTitle.value = prompts.find((prompt) => prompt.id === id)?.title ?? 'ClearDose replay'
  const activityJourneyId = activity.beginJourney(replayTitle.value, 'demo')

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
        await runReplayStep(3, 'select_medication_option', { offerId: best.offerId, deliveryOptionId: best.deliveryOptionId }, () =>
          actions.selectMedicationOption({
            offerId: best.offerId,
            deliveryOptionId: best.deliveryOptionId,
          }),
        )
        await runReplayStep(4, 'create_prescription_request_card', { offerId: best.offerId, deliveryOptionId: best.deliveryOptionId }, () =>
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
    } else if (id === 'multi-cart-savings') {
      setReplaySteps([
        ['compare_fulfillment_options', 'Compare atorvastatin fulfillment'],
        ['add_to_cart', 'Add one atorvastatin option'],
        ['compare_fulfillment_options', 'Compare metformin fulfillment'],
        ['add_to_cart', 'Add one metformin option'],
        ['compare_cart_savings', 'Compare both cart lines with current lowest totals'],
      ])
      const firstComparison = await runReplayStep(
        0,
        'compare_fulfillment_options',
        flagship,
        () => actions.compareFulfillmentOptions(flagship),
      )
      const firstOption = firstComparison.options.at(-1)
      if (!firstOption) throw new Error('No atorvastatin option was found.')
      await runReplayStep(1, 'add_to_cart', { offerId: firstOption.offerId, deliveryOptionId: firstOption.deliveryOptionId }, () =>
        actions.addToCart({
          offerId: firstOption.offerId,
          deliveryOptionId: firstOption.deliveryOptionId,
        }),
      )
      const secondComparison = await runReplayStep(
        2,
        'compare_fulfillment_options',
        secondMedication,
        () => actions.compareFulfillmentOptions(secondMedication),
      )
      const secondOption = secondComparison.options.at(-1)
      if (!secondOption) throw new Error('No metformin option was found.')
      await runReplayStep(3, 'add_to_cart', { offerId: secondOption.offerId, deliveryOptionId: secondOption.deliveryOptionId }, () =>
        actions.addToCart({
          offerId: secondOption.offerId,
          deliveryOptionId: secondOption.deliveryOptionId,
        }),
      )
      await runReplayStep(4, 'compare_cart_savings', {}, () => actions.compareCartSavings())
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
    activity.endJourney(activityJourneyId)
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
          <p>WebMCP lets a browser agent discover typed ClearDose actions instead of guessing what a button does. The interface and tools use the same application actions and shared state.</p>
          <nav class="docs-jump-links" aria-label="WebMCP page sections"><a href="#tool-inspector">Live inspector</a><a href="#prompt-library">Prompts</a><a href="#chained-workflows">Workflows</a><a href="#registered-tools-title">Tool catalog</a><RouterLink to="/hackathon">Project overview</RouterLink></nav>
        </div>
        <div class="agent-lab-health">
          <WebMCPStatus />
          <div class="health-row"><span class="status-dot status-dot--ready" aria-hidden="true"></span><strong>Current catalog</strong><span>{{ catalog.medications.length }} medications · {{ catalog.dataMode }} mode</span></div>
          <div class="health-row"><span class="status-dot status-dot--ready" aria-hidden="true"></span><strong>Pricing scenario</strong><span>{{ pricing.scenarioLabel }}</span></div>
        </div>
      </div>
    </section>

    <div class="container agent-lab-content">
      <section class="docs-boundary"><h2>One page state, two ways to work</h2><p>People search, select medications, arrange report facts, review source details and use the mock cart. Agents can call the same actions with validated arguments. A tool result describes the state the person can see.</p><p>The person chooses medications and exact shop configurations. Confirm cart edits, request drafts and checkout before an agent acts. ClearDose does not make clinical decisions, transmit prescriptions or charge payments. The application does not call an LLM; the connected browser agent supplies it.</p><p>Documentation examples that edit state, load medical information or touch commerce open a preview. Only two current-state reads can run here. Demo replays require a separate review.</p></section>
      <ToolInspector :tools="documentation" />
      <AgentComparison />
      <WorkflowGuide />
      <section class="prompt-section" aria-labelledby="demo-prompts-title">
        <div class="section-heading section-heading--split">
          <div><p class="section-kicker">Optional fixture walkthroughs</p><h2 id="demo-prompts-title">Try a demo prompt</h2><p>Replays use shared local actions and fictional fixtures. Review the state changes before starting.</p></div>
          <span class="copy-status" aria-live="polite">{{ copyStatus }}</span>
        </div>
        <div class="prompt-grid">
          <DemoPromptCard
            v-for="prompt in prompts"
            :key="prompt.id"
            v-bind="prompt"
            :running="activeReplay === prompt.id"
            :copy-only="prompt.id === 'drug-explorer'"
            @copy="copyPrompt"
            @replay="requestReplay"
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
            <h2 id="registered-tools-title">{{ allTools.length }} focused capabilities</h2>
            <p>Generated from the canonical definitions, including current dynamic catalog rules. A definition can be documented even when this browser does not support native registration. Preview consequential examples; safe reads explicitly report native or fallback execution.</p>
            <p role="status">{{ exampleStatus }}</p>
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

        <ToolLog :tools="allTools" />
      </div>
    </div>
    <dialog ref="previewDialog" class="docs-preview" aria-labelledby="example-preview-title" @close="previewTool = null; pendingReplay = null">
      <template v-if="previewTool"><p class="section-kicker">Nothing has run</p><h2 id="example-preview-title">Review example</h2><h3>{{ previewTool.title }}</h3><p><code>{{ previewTool.name }}</code> · {{ previewTool.classification }}</p><p>This is a preview only. It does not load missing prerequisites, create a cart item, or place an order. Use current IDs and review the intended action in the application before asking an agent to run it.</p><ul><li v-for="effect in previewTool.stateAffected" :key="effect">{{ effect }}</li></ul><pre>{{ JSON.stringify(previewTool.exampleInput, null, 2) }}</pre><CopyButton :text="previewTool.prompt" /><p><RouterLink to="/drugs/explore" @click="closePreview">Open Drug Explorer</RouterLink> · <RouterLink to="/medications" @click="closePreview">Open medications</RouterLink></p><button class="button button--secondary" @click="closePreview">Close preview</button></template>
      <template v-else-if="pendingReplay"><p class="section-kicker">Local demo actions</p><h2 id="example-preview-title">Review demo replay</h2><h3>{{ prompts.find(prompt => prompt.id === pendingReplay)?.title }}</h3><p>This replay switches to the fictional demo catalog and may navigate away from this page. It can change your search and comparison, selected offer, pricing scenario, prescription request draft, or add demo cart items. Existing cart items are not cleared. It does not submit a checkout order.</p><p>Use an empty demo session if you do not want these fixture actions mixed with your current work. The activity log records each action; it is not an automatic undo.</p><div class="docs-preview__actions"><button class="button button--primary" @click="confirmReplay">Start demo replay</button><button class="button button--secondary" @click="closePreview">Cancel</button></div></template>
    </dialog>
  </main>
</template>

<style scoped>
.agent-lab-content { display: flex; flex-direction: column; gap: 2rem; }
.docs-jump-links { display: flex; flex-wrap: wrap; gap: .75rem 1.1rem; margin-top: 1.5rem; }
.docs-jump-links a { font-weight: 650; text-decoration: underline; text-underline-offset: .2rem; }
.docs-boundary { max-width: 75ch; }
.agent-lab-grid { display: block; }
.tools-explorer, .tool-group { min-width: 0; }
.tool-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.docs-preview { width: min(620px, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto; border: 1px solid #b8cbc9; border-radius: 20px; padding: clamp(1rem, 4vw, 2rem); color: #102a43; }
.docs-preview::backdrop { background: #0b2239aa; }
.docs-preview pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 1rem; background: #f3f7fa; }
.docs-preview__actions { display: flex; gap: .75rem; flex-wrap: wrap; }
@media(max-width: 720px) { .tool-grid { grid-template-columns: 1fr; } }
@media print { .docs-jump-links, .prompt-section, .docs-preview { display: none; } .agent-lab-content { gap: 1rem; } .tool-grid { display: block; } :deep(details::details-content) { content-visibility: visible; } :deep(pre) { max-height: none; overflow: visible; } }
</style>
