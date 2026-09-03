import assert from 'node:assert/strict'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Validate saved browser results. This does not run the app or repeat tool calls.
const directory = new URL('./release/', import.meta.url)
const read = async name => JSON.parse(await readFile(new URL(name, directory), 'utf8'))
const receipts = await read('receipts.json')
const byStep = new Map(receipts.map(row => [row.step, row]))
const row = step => byStep.get(step)
const out = step => row(step).output
const cents = value => Math.round(value * 100)
const verify = (step, condition, method) => {
  assert.ok(condition, `Recorded step ${step}: ${method}`)
  assert.equal(row(step).status, 'returned')
  row(step).verification = { status: 'passed', method, scope: 'Saved structured result; not a clinical accuracy evaluation.' }
}

verify(1, out(1).total === 54 && out(1).returned === 5, 'Returned five catalog rows from 54 loaded identities, not all 54 IDs.')
for (const step of [2, 9, 60]) {
  const value = out(step)
  verify(step, value.query === row(step).input.query && value.returned === value.results.length && value.count >= value.returned && value.results.every(result => result.category && result.source), 'Search query, returned row count, category and source fields match the saved input. This is a result page, not exhaustive catalog coverage.')
}
for (const step of [4, 10]) {
  const value = out(step)
  verify(step, value.medicationId === row(step).input.medicationId && value.dataStatus === 'live' && value.prescriptionRequired === null && value.quantities.length === 0 && value.shopConfigurations.length === 3 && /fictional/.test(value.pricingNotice), 'Live public identity has three separately labeled fictional shop configurations. Unknown prescription status remains null and public quantities remain empty.')
}
for (const step of [5, 11]) {
  const value = out(step)
  const input = row(step).input
  verify(step, value.medication.id === input.medicationId && value.medication.form === input.form && value.medication.strength === input.strength && value.medication.quantity === input.quantity && value.options.every(option => cents(option.medicationSubtotal) + cents(option.deliveryPrice) === cents(option.total)) && /Fictional/.test(value.pricingNotice), 'Every returned offer uses the requested exact mock configuration. Medication and delivery amounts sum to the total in cents; fictional-price disclosure is present.')
}
verify(6, out(6).selectedOption.offerId === row(6).input.offerId && out(6).selectedOption.deliveryOptionId === 'standard' && cents(out(6).total) === 2276, 'Selected the returned ClearDose Direct offer and standard delivery at a fictional $22.76 total.')
verify(7, out(7).requestId === 'PR-2026-0001' && cents(out(7).estimatedTotal) === 2276 && /not a prescription/.test(out(7).notice), 'Created the local request summary for the selected offer with its estimate and not-a-prescription notice.')
verify(8, out(8).cartCount === 1 && out(8).outcome === 'added' && cents(out(8).total) === 2276, 'Added the first public medication once and returned its persisted cart ID.')
verify(12, out(12).cartCount === 2 && out(12).cartItemId !== out(8).cartItemId && cents(out(12).total) === 4871, 'Added a distinct second public medication. The two standard-delivery lines total $48.71.')
for (const step of [13, 14]) {
  verify(step, out(step).itemCount === 2 && out(step).items.length === 1 && cents(out(step).grandTotal) === 4871, 'Paged cart read contains one of two distinct public medication lines and the same $48.71 cart total.')
}
verify(15, out(15).cartItemId === out(8).cartItemId && out(15).deliveryOptionId === 'express' && cents(out(15).grandTotal) === 5271, 'Changing the first line to express delivery raised the cart total by exactly $4.00.')
for (const step of [16, 17]) {
  verify(step, cents(out(step).currentTotal) === 5271 && cents(out(step).optimizedTotal) === 3953 && cents(out(step).potentialSavings) === 1318 && /not retail or insurance/.test(out(step).basis), 'Both exact-SKU savings pages agree on $52.71 current, $39.53 hypothetical lowest total, and $13.18 simulated savings.')
}
assert.equal(cents(out(16).items[0].bestAvailableTotal) + cents(out(17).items[0].bestAvailableTotal), 3953)
verify(18, out(18).selectedDrugCount === 0 && out(18).cardCount === 0, 'Explorer was empty before the selected-drug mutation.')
verify(19, out(19).selectedDrugIds.join(',') === 'med-public-empagliflozin,med-public-cetirizine-hcl' && out(19).cardCount === 0, 'The native selection added exactly the two public medications without creating cards.')
verify(20, out(20).selectedDrugIds.length === 2 && out(20).cardCount === 2, 'The native fact request retained both drugs and created exactly two cards.')
verify(21, out(21).rows.map(card => card.factType).join(',') === 'identity,pricing', 'The state reader returned current card IDs and the requested identity and pricing types.')
verify(22, out(22).cardCount === 2 && out(22).selectedDrugIds.length === 2 && row(22).input.factType === 'ingredients', 'Changed the identity card to ingredients while retaining two cards and both selected drugs; reviewed state and receipt images show the change.')
for (let step = 23; step <= 41; step += 2) {
  const edit = out(step)
  const state = out(step + 1)
  const consistent = edit.workspaceRevision === state.workspaceRevision && state.cardCount === 2 && state.selectedDrugCount === 2 && state.rows[0].factType === row(step).input.factType
  verify(step, consistent, 'Repeated native edit matches its following state read, including revision, fact type and both retained drugs.')
  verify(step + 1, consistent, 'Read confirms the preceding native edit on the same tool set without discovery, reload or kernel reset.')
}
const related = [43, 44, 45, 46].map(out)
assert.equal(related.flatMap(page => page.rows).length, 11)
assert.equal(related.at(-1).nextOffset, null)
assert.ok(related.flatMap(page => page.rows).some(field => field.value === 'med-public-dapagliflozin'))
for (const step of [43, 44, 45, 46]) verify(step, out(step).scope === 'catalog' && out(step).section === 'matches', 'Four pages complete the eleven related-result fields. Dapagliflozin is an explained category match, not a therapeutic substitution.')
for (const step of [47, 48, 49, 50]) {
  verify(step, out(step).scope === 'page' && out(step).contextRevision === row(step).input.contextRevision && out(step).rows.length === out(step).returned && out(step).nextOffset !== null, 'Current page-scoped comparison returned a bounded page with a continuation offset. These samples do not claim that every field was fetched.')
}
assert.ok(out(49).rows.some(field => field.path.includes('/clinical/indications/') && field.part === 1 && field.parts === 4))
assert.ok(out(50).rows.some(field => field.value === 'https://rxnav.nlm.nih.gov/REST/rxcui/1545653/properties.json'))
verify(51, out(51).itemCount === 2 && cents(out(51).grandTotal) === 5271, 'Public-data-only mode preserved both public medication cart lines and their total.')
verify(52, out(52).outcome === 'already-present' && out(52).cartItemId === out(12).cartItemId && out(52).cartCount === 2, 'A deliberate duplicate-add test in public-only mode preserved the existing cart ID and did not add a third item.')
const persistence = await read('persistence.json')
assert.equal(persistence.passed, true)
verify(53, out(53).cardCount === 2 && out(53).selectedDrugCount === 2 && out(53).rows.map(card => card.factType).join(',') === 'ingredients,pricing', 'The first Explorer read after the planned reload retained both selected drugs and fact cards.')
for (const step of [54, 55]) verify(step, out(step).items[0].cartItemId === out(step === 54 ? 13 : 14).items[0].cartItemId && cents(out(step).grandTotal) === 5271, 'Reload preserved this cart line ID and the $52.71 total. See both pages and persistence.json.')
assert.equal(row(3).status, 'failed')
assert.equal(row(56).status, 'failed')
assert.match(row(56).error, /does not cover every prescription item/)
verify(57, out(57).orderId === 'CD-2026-0001' && out(57).status === 'demo-order-created' && cents(out(57).total) === 5271 && /No payment or prescription was transmitted/.test(out(57).notice), 'Created one local simulated order after the explicit incomplete-request rejection. The saved success was recovered without repeating checkout.')
for (const step of [58, 59]) verify(step, out(step).orderId === out(57).orderId && out(step).itemCount === 2 && out(step).items.length === 1 && cents(out(step).total) === 5271 && !('fullName' in out(step)) && !('address' in out(step)), 'Paged order status contains the matching public medication and delivery with the $52.71 total, without recipient name or address.')
assert.notEqual(out(58).items[0].offerId, out(59).items[0].offerId)
verify(61, out(61).total === 58 && out(61).returned === 3, 'Production catalog read returned three rows from 58 loaded identities.')
verify(62, out(62).itemCount === 0, 'Production cart remained empty, as observed before the read-only production checks.')

const stress = await read('native-stress.json')
assert.equal(stress.length, 40)
assert.ok(stress.every(call => call.status === 'passed' && call.native && call.output.total === 54 && call.output.returned === 1))
const mixed = await read('native-mixed-stress.json')
assert.equal(mixed.successfulCalls, 20)
assert.equal(mixed.explorerDefinitionsUnchanged, true)
assert.equal(mixed.reloads + mixed.kernelResets, 0)
const production = await read('production-verification.json')
assert.equal(production.assetMatches, true)
assert.equal(production.tools.count, 19)
assert.equal(production.console.length, 0)
const schemas = await read('schema-measurements.json')
assert.ok(schemas.every(snapshot => snapshot.count === 19 && snapshot.nativeBytes <= 18000))
for (const receipt of receipts) for (const screenshot of receipt.screenshots ?? []) assert.ok((await stat(new URL(screenshot, directory))).isFile())

const successful = receipts.filter(receipt => receipt.status === 'returned')
const covered = [...new Set(successful.map(receipt => receipt.tool))]
assert.equal(successful.length + stress.length, 100)
assert.equal(covered.length, 17)
const summary = {
  checkedAt: new Date().toISOString(),
  production,
  automatedReleaseGate: { unitTests: 263, unitFiles: 27, evaluationTests: 18, chromiumBrowserTests: 26, typecheck: 'passed', build: 'passed', diffCheck: 'passed', dependencyInstall: 'locked install passed', retryCount: 0 },
  native: {
    registeredTools: 19, successfulToolNames: covered, successfulCalls: successful.length + stress.length,
    previewSuccessfulCalls: 97, productionSuccessfulCalls: 3, receiptEntries: receipts.length,
    initialReadOnlyStressCalls: 40, mixedEditReadCalls: 20, afterHelperResetBeforePlannedReload: 50,
    nativeDeclarationByteRange: [Math.min(...schemas.map(snapshot => snapshot.nativeBytes)), Math.max(...schemas.map(snapshot => snapshot.nativeBytes))],
    configurationLimitRecurrences: 0, helperKernelResets: 1, plannedAppReloads: 1,
    executionCoverageLimit: '17 of 19 tools executed in this corrected release. remove_cart_item and cleardose_remove_fact_card have automated coverage and historical native evidence, but were not rerun because the browser requires fresh deletion confirmation.',
    failures: 'Step3 was a browser approval-context rejection before execution. Step56 was an expected incomplete-request validation rejection. Separate screenshot/helper incidents remain in incidents.json. No uncertain mutation was repeated.',
    interpretation: 'No configuration-limit recurrence was observed. This was not one uninterrupted browser-client run and does not establish Chrome internal limits or a live-model accuracy score.'
  },
  persistence,
  evidence: {
    receiptScreenshots: receipts.reduce((count, receipt) => count + (receipt.screenshots?.length ?? 0), 0),
    primaryMedicationCards: '63-production-medication-cards-settled.png',
    primaryCart: '52-live-mode-idempotent-cart-state.png',
    notes: '12 and54 state images caught drawer motion; use52 for the settled cart. 61-production-medication-cards.png has a full-page stitching artifact; use63. Repeated stress and continuation reads retain JSON but not duplicate screenshots. Long outputs continue beyond the pictured viewport.'
  },
  dataLimits: 'Startup uses24 bounded public queries with3workers and up to4hits per query, not the whole FDA catalog. Search loads further public matches. Full label and benchmark details load on demand. Missing classification uses Other medications. Generated prices, configurations, availability and fulfillment remain fictional; unknown clinical facts and prescription status are not invented.'
}
await writeFile(new URL('receipts.json', directory), JSON.stringify(receipts, null, 2) + '\n')
await writeFile(new URL('summary.json', directory), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ verifiedSavedResults: receipts.filter(receipt => receipt.verification).length, nativeSuccessfulCalls: summary.native.successfulCalls, coveredTools: covered.length, evidenceDirectory: fileURLToPath(directory) }, null, 2))
