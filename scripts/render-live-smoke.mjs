import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Run: node scripts/render-live-smoke.mjs [evidence-directory] [--check]
// --check validates the report in memory without changing evidence files.
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const expectedTools = [
  'search_medications', 'get_medication_details', 'compare_fulfillment_options',
  'select_medication_option', 'create_prescription_request_card', 'add_to_cart',
  'view_cart', 'compare_cart_savings', 'remove_cart_item', 'set_delivery_option',
  'checkout_demo_order', 'get_order_status', 'find_related_medications',
  'compare_medications', 'cleardose_select_drugs', 'cleardose_show_drug_fact',
  'cleardose_update_fact_card', 'cleardose_remove_fact_card', 'cleardose_get_explorer_state',
]

const html = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])
const pretty = value => JSON.stringify(value, null, 2) ?? 'Not recorded'
const textValue = value => value === undefined || value === null ? 'Not recorded' : typeof value === 'string' ? value : pretty(value)
const markdown = value => textValue(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/[\\\x60*_[\]{}()|#]/g, '\\$&').replace(/\r?\n/g, '<br>')
const codeBlock = value => {
  const text = pretty(value)
  const runs = text.match(/\x60+/g) ?? []
  const fence = String.fromCharCode(96).repeat(Math.max(3, ...runs.map(run => run.length + 1)))
  return [fence + 'json', text, fence].join('\n')
}
const hasVerification = receipt => receipt.verification !== undefined && receipt.verification !== null
const verificationLabel = receipt => {
  if (!hasVerification(receipt)) return 'Not recorded'
  const value = receipt.verification
  if (value === true) return 'Recorded as verified'
  if (value === false) return 'Recorded as not verified'
  if (typeof value === 'string') return value
  return textValue(value.status ?? value.result ?? value)
}
const executionLabel = receipt => receipt.native === true ? 'Native browser tool call'
  : receipt.native === false ? 'Recorded as non-native' : textValue(receipt.execution ?? receipt.transport)
const capturedUrl = receipt => {
  if (typeof receipt.url === 'string') return receipt.url
  const dom = receipt.stateDom ?? receipt.receiptDom
  return typeof dom === 'string' ? dom.match(/URL:\s*"([^"]+)"/)?.[1] : undefined
}
const nativeRoute = receipt => {
  if (typeof receipt.nativeRoute === 'string') return receipt.nativeRoute
  if (typeof receipt.route === 'string') return receipt.route
  try { const url = new URL(capturedUrl(receipt)); return url.pathname + url.search + url.hash }
  catch { return 'Not recorded' }
}
const publicUrl = value => {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}
const readJson = async (path, optional = false) => {
  try { return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')) }
  catch (error) {
    if (optional && error.code === 'ENOENT') return undefined
    throw new Error('Cannot read ' + path + ': ' + error.message)
  }
}
const inside = (directory, path) => {
  const child = relative(directory, path)
  return child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child)
}

async function screenshot(directory, root, name) {
  if (typeof name !== 'string' || !name || isAbsolute(name) || !/\.(png|jpe?g|webp|gif)$/i.test(name)) {
    return { name: textValue(name), available: false, reason: 'Unsupported local screenshot reference.' }
  }
  const path = resolve(directory, name)
  if (!inside(directory, path)) return { name, available: false, reason: 'Screenshot path is outside the evidence directory.' }
  try {
    if (!inside(root, await realpath(path)) || !(await stat(path)).isFile()) {
      return { name, available: false, reason: 'Screenshot is not a local evidence file.' }
    }
    const local = relative(directory, path).split(sep).join('/')
    return {
      name: local, href: local.split('/').map(encodeURIComponent).join('/'), available: true,
      kind: /-state\./i.test(local) ? 'state' : /-receipt\./i.test(local) ? 'receipt' : 'attachment',
    }
  } catch (error) {
    return { name, available: false, reason: error.code === 'ENOENT' ? 'Screenshot file is missing.' : 'Screenshot file could not be read.' }
  }
}

const imageTitle = kind => kind === 'state' ? 'Visible application state' : kind === 'receipt' ? 'Native tool receipt' : 'Additional screenshot'
const imageHtml = (image, entry, thumbnail = false) => image
  ? '<a class="image-link" href="' + html(image.href) + '"><img src="' + html(image.href) + '" alt="' +
    html(imageTitle(image.kind) + ' for ' + entry.receipt.tool + ', recorded step ' + entry.step) + '"' +
    (thumbnail ? '' : ' loading="lazy"') + '></a>'
  : '<div class="missing-image">Screenshot not available</div>'
const jsonDetails = (label, value, open = false) => '<details' + (open ? ' open' : '') + '><summary>' + html(label) +
  '</summary><pre>' + html(pretty(value)) + '</pre></details>'

export async function renderLiveSmoke(directory) {
  directory = resolve(directory)
  const root = await realpath(directory)
  const [receipts, schemas, summary] = await Promise.all([
    readJson(resolve(directory, 'receipts.json')),
    readJson(resolve(directory, 'initial-tool-schemas.json'), true),
    readJson(resolve(directory, 'summary.json'), true),
  ])
  if (!Array.isArray(receipts)) throw new Error('receipts.json must contain an array of recorded calls.')
  const warnings = []
  const entries = await Promise.all(receipts.map(async (receipt, index) => {
    if (!receipt || typeof receipt !== 'object' || typeof receipt.tool !== 'string' || !receipt.tool.trim()) {
      throw new Error('Receipt ' + (index + 1) + ' has no valid tool name.')
    }
    const images = await Promise.all((Array.isArray(receipt.screenshots) ? receipt.screenshots : []).map(name => screenshot(directory, root, name)))
    const step = receipt.step ?? 'entry ' + (index + 1)
    const available = images.filter(image => image.available)
    for (const image of images.filter(image => !image.available)) warnings.push('Step ' + step + ': ' + image.name + '. ' + image.reason)
    if (!available.some(image => image.kind === 'state')) warnings.push('Step ' + step + ': no state screenshot recorded.')
    if (!available.some(image => image.kind === 'receipt')) warnings.push('Step ' + step + ': no receipt screenshot recorded.')
    return { receipt, step, anchor: 'step-' + (index + 1), images: available }
  }))
  const schemaNames = Array.isArray(schemas) ? schemas.flatMap(schema => typeof schema?.name === 'string' ? [schema.name] : []) : []
  if (schemas !== undefined && !Array.isArray(schemas)) warnings.push('Initial schema snapshot is not an array; its tool coverage was not counted.')
  const byTool = new Map(expectedTools.map(tool => [tool, entries.filter(entry => entry.receipt.tool === tool)]))
  const covered = expectedTools.filter(tool => byTool.get(tool).length > 0)
  const missing = expectedTools.filter(tool => byTool.get(tool).length === 0)
  const extra = [...new Set(entries.map(entry => entry.receipt.tool))].filter(tool => !expectedTools.includes(tool))
  const stats = {
    expectedTools: expectedTools.length, recordedTools: covered.length, recordedCalls: entries.length,
    callsWithVerification: entries.filter(entry => hasVerification(entry.receipt)).length,
    availableScreenshots: entries.reduce((count, entry) => count + entry.images.length, 0),
    schemaTools: schemaNames.length, missingTools: missing, additionalTools: extra, warnings,
  }
  const generatedAt = new Date().toISOString()
  const renderOverview = (linkPrefix = '', compact = false) => expectedTools.map((tool, index) => {
    const calls = byTool.get(tool)
    const primary = calls.find(entry => hasVerification(entry.receipt) && entry.images.some(image => image.kind === 'receipt'))
      ?? calls.find(entry => entry.images.some(image => image.kind === 'receipt'))
      ?? calls.find(entry => hasVerification(entry.receipt) && entry.images.some(image => image.kind === 'state'))
      ?? calls.find(entry => entry.images.some(image => image.kind === 'state')) ?? calls[0]
    const primaryImage = primary?.images.find(image => image.kind === 'receipt') ?? primary?.images.find(image => image.kind === 'state')
    return '<article class="overview-card"><div class="overview-label"><span>' + String(index + 1).padStart(2, '0') +
      '</span><h3>' + (primary ? '<a href="' + linkPrefix + '#' + primary.anchor + '">' + html(tool) + '</a>' : html(tool)) + '</h3></div>' +
      imageHtml(primaryImage, primary ?? { receipt: { tool }, step: 'none' }, true) +
      '<p>' + (primary ? (compact ? '' : html(calls.length + ' recorded call' + (calls.length === 1 ? '' : 's')) + '<br>') +
        'Verification: ' + html(verificationLabel(primary.receipt)) : 'No recorded call') + '</p></article>'
  }).join('\n')
  const overview = renderOverview()
  const tableRows = expectedTools.map(tool => {
    const calls = byTool.get(tool)
    return '<tr><th scope="row"><code>' + html(tool) + '</code></th><td>' + calls.length + '</td><td>' +
      html(calls.length ? [...new Set(calls.map(entry => textValue(entry.receipt.status)))].join(', ') : 'Not recorded') +
      '</td><td>' + html(calls.length ? [...new Set(calls.map(entry => verificationLabel(entry.receipt)))].join('; ') : 'Not recorded') +
      '</td><td>' + calls.map(entry => '<a href="#' + entry.anchor + '">' + html(entry.step) + '</a>').join(', ') + '</td></tr>'
  }).join('\n')
  const stepHtml = entries.map(entry => {
    const { receipt } = entry
    const url = publicUrl(capturedUrl(receipt))
    const metadata = [
      ['Recorded status', textValue(receipt.status)], ['Verification', verificationLabel(receipt)],
      ['Data kind', textValue(receipt.dataKind)], ['Execution context', executionLabel(receipt)],
      ['Recorded browser route', nativeRoute(receipt)], ['Timestamp', textValue(receipt.timestamp)],
      ['Duration', receipt.durationMs === undefined ? 'Not recorded' : String(receipt.durationMs) + ' ms'],
    ]
    return '<article class="step-card" id="' + entry.anchor + '"><header><span class="step-number">Step ' + html(entry.step) +
      '</span><h3>' + html(receipt.tool) + '</h3></header><dl class="metadata">' + metadata.map(([key, value]) =>
      '<div><dt>' + html(key) + '</dt><dd>' + html(value) + '</dd></div>').join('') + '</dl>' +
      (url ? '<p class="source-link"><a href="' + html(url) + '" target="_blank" rel="noopener noreferrer">Recorded application URL</a></p>' : '') +
      '<h4>Notes</h4><p class="notes">' + html(textValue(receipt.notes)) + '</p>' +
      jsonDetails('Example input', receipt.input, true) + jsonDetails('Recorded output', receipt.output) +
      (hasVerification(receipt) && typeof receipt.verification === 'object' ? jsonDetails('Recorded verification details', receipt.verification) : '') +
      '<div class="screenshots">' + entry.images.map(image => '<figure>' + imageHtml(image, entry) + '<figcaption>' +
        html(imageTitle(image.kind)) + ' · ' + html(image.name) + '</figcaption></figure>').join('') + '</div>' +
      jsonDetails('Full recorded receipt and context', receipt) + '</article>'
  }).join('\n')
  const summaryHtml = summary === undefined ? '<p class="muted">No summary.json has been recorded. Deployment checks and limits are not inferred from tool receipts.</p>'
    : '<p>These checks and limits come from <a href="summary.json">summary.json</a>.</p>' + jsonDetails('Recorded deployment checks and limits', summary, true)
  const warningHtml = warnings.length ? '<section class="warning"><h2>Evidence gaps</h2><ul>' +
    warnings.map(warning => '<li>' + html(warning) + '</li>').join('') + '</ul></section>' : ''
  const documentHtml = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\' file: data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' +
    '<title>ClearDose live WebMCP evidence</title><style>' + styles + '</style></head><body><a class="skip" href="#coverage">Skip to tool coverage</a>' +
    '<main><header class="report-header"><p class="eyebrow">ClearDose · recorded browser evidence</p><h1>Live WebMCP tool review</h1>' +
    '<p>Recorded tool inputs, outputs, visible state, and receipts. A captured call is not automatically a verified result.</p>' +
    '<p class="muted">Generated ' + html(generatedAt) + '. Evidence folder: ' + html(relative(resolve(scriptDirectory, '..'), directory).split(sep).join('/')) + '.</p>' +
    '<nav aria-label="Report sections"><a href="#overview">Tool screenshots</a><a href="#coverage">Coverage</a><a href="#deployment">Deployment checks</a><a href="#steps">Recorded calls</a>' +
    '<a href="overview.html">Compact overview</a><a href="receipts.json">Source receipts</a><a href="report.md">Markdown report</a></nav></header>' +
    '<section class="metrics" aria-label="Evidence counts"><div><strong>' + covered.length + ' / ' + expectedTools.length + '</strong><span>expected tools recorded</span></div>' +
    '<div><strong>' + entries.length + '</strong><span>recorded calls</span></div><div><strong>' + stats.callsWithVerification +
    '</strong><span>calls with a verification field</span></div><div><strong>' + stats.availableScreenshots + '</strong><span>available screenshots</span></div></section>' +
    '<section id="overview"><h2>Tool screenshots</h2><p class="muted">One recorded receipt image per expected tool, with application state as a fallback. Open an image for full size or a tool name for its full record.</p>' +
    '<div class="overview-grid">' + overview + '</div></section><section id="coverage"><h2>Coverage</h2>' +
    '<p>Verification is copied only from the recorded verification field. Recorded status is shown separately.</p>' +
    (schemas === undefined ? '<p class="muted">No initial schema snapshot was recorded.</p>' : '<p class="muted">Initial schema snapshot lists ' + schemaNames.length + ' tools, including ' + expectedTools.filter(tool => schemaNames.includes(tool)).length + ' of the ' + expectedTools.length + ' expected tools.</p>') +
    '<div class="table-wrap"><table><caption class="sr-only">Expected tool coverage and recorded verification</caption><thead><tr><th scope="col">Tool</th><th scope="col">Calls</th><th scope="col">Recorded status</th><th scope="col">Verification</th><th scope="col">Steps</th></tr></thead><tbody>' +
    tableRows + '</tbody></table></div><p><strong>Missing tools:</strong> ' + html(missing.length ? missing.join(', ') : 'None; every expected tool has a recorded call.') + '</p>' +
    (extra.length ? '<p><strong>Additional recorded tools:</strong> ' + html(extra.join(', ')) + '</p>' : '') + '</section>' +
    '<section id="deployment"><h2>Deployment checks and limits</h2>' + summaryHtml + '</section>' + warningHtml +
    '<section id="steps"><h2>Recorded calls</h2>' + (stepHtml || '<p>No tool calls have been recorded yet.</p>') + '</section>' +
    '<footer>Source records remain unchanged. This report does not infer clinical safety, retail availability, or successful verification from a screenshot.</footer></main></body></html>\n'

  const overviewHtml = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\' file: data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' +
    '<title>ClearDose native tool receipt overview</title><style>' + styles + '\n' + compactStyles + '</style></head><body class="compact-overview">' +
    '<a class="skip" href="#tool-receipts">Skip to tool receipts</a><main><header class="compact-header"><div><p class="eyebrow">ClearDose · recorded browser evidence</p>' +
    '<h1>Native WebMCP tool receipts</h1><p class="compact-counts">' + covered.length + ' / ' + expectedTools.length + ' tools recorded · ' +
    entries.length + ' calls · ' + stats.callsWithVerification + ' calls with verification · ' + stats.availableScreenshots + ' screenshots</p></div>' +
    '<a href="index.html">Open the full evidence report</a></header><section id="tool-receipts" aria-label="Expected tool receipt screenshots"><div class="overview-grid">' +
    renderOverview('index.html', true) + '</div></section><footer>Verification labels come from the recorded verification field. Click any thumbnail to inspect the original image. ' +
    'Generated ' + html(generatedAt) + '.</footer></main></body></html>\n'

  const lines = [
    '# ClearDose live WebMCP evidence', '', 'Generated: ' + generatedAt, '',
    'Recorded tool inputs, outputs, visible state, and receipts. A captured call is not automatically a verified result.', '',
    '## Coverage', '', '- Expected tools recorded: ' + covered.length + ' / ' + expectedTools.length,
    '- Recorded calls: ' + entries.length, '- Calls with a verification field: ' + stats.callsWithVerification,
    '- Available screenshots: ' + stats.availableScreenshots,
    '- Initial schema snapshot: ' + (schemas === undefined ? 'Not recorded' : schemaNames.length + ' tool definitions'), '',
    '| Tool | Calls | Recorded status | Verification | Steps |', '| --- | ---: | --- | --- | --- |',
    ...expectedTools.map(tool => {
      const calls = byTool.get(tool)
      return '| ' + markdown(tool) + ' | ' + calls.length + ' | ' +
        markdown(calls.length ? [...new Set(calls.map(entry => textValue(entry.receipt.status)))].join(', ') : 'Not recorded') + ' | ' +
        markdown(calls.length ? [...new Set(calls.map(entry => verificationLabel(entry.receipt)))].join('; ') : 'Not recorded') + ' | ' +
        calls.map(entry => '[' + markdown(entry.step) + '](#' + entry.anchor + ')').join(', ') + ' |'
    }),
    '', 'Missing tools: ' + markdown(missing.length ? missing.join(', ') : 'None; every expected tool has a recorded call.'), '',
    ...(extra.length ? ['Additional recorded tools: ' + markdown(extra.join(', ')), ''] : []),
    'Verification above comes only from the verification field, never from the recorded status alone.', '',
    '## Deployment checks and limits', '',
    ...(summary === undefined ? ['No summary.json has been recorded. Deployment checks and limits are not inferred.'] : ['Source: [summary.json](summary.json)', '', codeBlock(summary)]), '',
    ...(warnings.length ? ['## Evidence gaps', '', ...warnings.map(warning => '- ' + markdown(warning)), ''] : []),
    '## Recorded calls', '',
  ]
  for (const entry of entries) {
    const { receipt } = entry
    lines.push('<a id="' + entry.anchor + '"></a>', '', '### Step ' + markdown(entry.step) + ': ' + markdown(receipt.tool), '',
      '- Recorded status: ' + markdown(receipt.status), '- Verification: ' + markdown(verificationLabel(receipt)),
      '- Data kind: ' + markdown(receipt.dataKind), '- Execution context: ' + markdown(executionLabel(receipt)),
      '- Recorded browser route: ' + markdown(nativeRoute(receipt)), '- Timestamp: ' + markdown(receipt.timestamp),
      '- Duration: ' + markdown(receipt.durationMs === undefined ? 'Not recorded' : receipt.durationMs + ' ms'), '',
      'Notes: ' + markdown(receipt.notes), '', '#### Example input', '', codeBlock(receipt.input), '',
      '<details><summary>Recorded output</summary>', '', codeBlock(receipt.output), '', '</details>', '')
    if (hasVerification(receipt) && typeof receipt.verification === 'object') lines.push('Recorded verification:', '', codeBlock(receipt.verification), '')
    for (const image of entry.images) lines.push('![' + markdown(imageTitle(image.kind) + ' for ' + receipt.tool) + '](' + image.href + ')', '')
    lines.push('<details><summary>Full recorded receipt and context</summary>', '', codeBlock(receipt), '', '</details>', '')
  }
  lines.push('Source: [receipts.json](receipts.json). Interactive gallery: [index.html](index.html).', '')
  return { html: documentHtml, overviewHtml, markdown: lines.join('\n'), stats }
}

const styles = [
  ':root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#183348;background:#f5f8fa;line-height:1.5}*{box-sizing:border-box}body{margin:0}main{max-width:1440px;margin:auto;padding:36px clamp(18px,4vw,48px) 48px}a{color:#086e67;text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid #168f82;outline-offset:4px}',
  'h1,h2,h3,h4{line-height:1.2;color:#102a43}h1{font-size:clamp(2rem,4vw,3rem);margin:.4rem 0 1rem}h2{font-size:1.5rem;margin:0 0 1rem}h3{margin:0;font-size:1.08rem;overflow-wrap:anywhere}h4{font-size:.9rem;margin:1rem 0 .35rem}section{margin-top:36px}.report-header{max-width:1050px}.report-header>p{max-width:900px}.eyebrow{font-size:.77rem;letter-spacing:.07em;text-transform:uppercase;color:#086e67;font-weight:700}.muted,footer{color:#53697b;font-size:.84rem}nav{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:20px;font-size:.88rem}',
  '.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metrics>div{display:grid;gap:3px;padding:18px;background:white;border:1px solid #d9e2ec;border-radius:12px}.metrics strong{font-size:1.65rem;font-variant-numeric:tabular-nums}.metrics span{font-size:.8rem;color:#53697b}',
  '.overview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.overview-card{background:white;border:1px solid #d9e2ec;border-radius:10px;overflow:hidden;min-width:0}.overview-label{display:flex;align-items:start;gap:8px;padding:12px}.overview-label>span{color:#64798a;font-size:.75rem}.overview-label h3{font-size:.8rem}.overview-card img{width:100%;height:160px;object-fit:contain;object-position:top;background:#edf2f5}.overview-card p{font-size:.76rem;color:#53697b;margin:10px 12px}.image-link{display:block}.missing-image{display:grid;place-items:center;height:160px;background:#edf2f5;color:#637588;font-size:.8rem}',
  '.table-wrap{position:relative;overflow-x:auto;border:1px solid #d9e2ec;border-radius:10px;background:white}table{border-collapse:collapse;width:100%;font-size:.82rem}th,td{padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid #e2e8f0}thead{background:#eaf2f5}tbody tr:last-child>*{border-bottom:0}th code{font-size:.77rem;overflow-wrap:anywhere}td{overflow-wrap:anywhere}',
  '.step-card{background:white;border:1px solid #d9e2ec;border-radius:12px;padding:clamp(16px,3vw,28px);margin-top:22px;scroll-margin-top:16px}.step-card>header{display:flex;align-items:baseline;flex-wrap:wrap;gap:10px 16px}.step-number{color:#086e67;font-size:.78rem;font-weight:700}.metadata{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 20px;margin:22px 0}.metadata dt{font-size:.72rem;color:#53697b}.metadata dd{font-size:.85rem;margin:3px 0 0;overflow-wrap:anywhere}.notes{white-space:pre-wrap;font-size:.9rem;margin-top:0}.source-link{font-size:.83rem}',
  'details{border:1px solid #dce4eb;border-radius:8px;margin-top:12px;background:#f9fbfc}summary{cursor:pointer;padding:11px 14px;font-size:.83rem;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:36rem;overflow:auto;font-size:.77rem;line-height:1.6;padding:0 14px 14px;margin:0;color:#203d52}.screenshots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:20px}.screenshots figure{margin:0;min-width:0}.screenshots img{width:100%;height:auto;max-height:44rem;object-fit:contain;object-position:top;border:1px solid #dce4eb;background:#edf2f5}.screenshots figcaption{font-size:.72rem;color:#53697b;overflow-wrap:anywhere;margin-top:6px}.warning{padding:18px;background:#fff7e6;border:1px solid #ecd3a7;border-radius:10px}.warning li{font-size:.83rem;margin-top:5px;overflow-wrap:anywhere}footer{margin-top:32px;border-top:1px solid #d9e2ec;padding-top:16px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.skip{position:fixed;top:8px;left:8px;transform:translateY(-160%);background:white;padding:10px;z-index:2}.skip:focus{transform:none}',
  '@media(max-width:1000px){.overview-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:700px){.overview-grid,.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metadata{grid-template-columns:repeat(2,minmax(0,1fr))}.screenshots{grid-template-columns:minmax(0,1fr)}}@media(max-width:420px){.overview-grid,.metadata{grid-template-columns:minmax(0,1fr)}.metrics>div{padding:12px}.metrics strong{font-size:1.3rem}}@media print{main{max-width:none;padding:0}.overview-card,.step-card{break-inside:avoid}details,pre{max-height:none}.skip,nav{display:none}}',
].join('\n')

const compactStyles = [
  '.compact-overview main{max-width:1800px;padding:20px 24px}.compact-header{display:flex;align-items:center;justify-content:space-between;gap:12px 28px}.compact-header .eyebrow{margin:0 0 4px;font-size:.7rem}.compact-header h1{font-size:1.65rem;margin:0 0 5px}.compact-header>a{font-size:.8rem;white-space:nowrap}.compact-counts{margin:0;color:#53697b;font-size:.8rem}.compact-overview section{margin-top:18px}',
  '.compact-overview .overview-grid{grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.compact-overview .overview-label{padding:8px 10px;min-height:44px;gap:6px}.compact-overview .overview-label h3{font-size:.74rem}.compact-overview .overview-label>span{font-size:.66rem}.compact-overview .overview-card img,.compact-overview .missing-image{height:148px}.compact-overview .overview-card p{font-size:.71rem;margin:7px 10px}.compact-overview footer{margin-top:15px;padding-top:10px;font-size:.7rem}',
  '@media(max-width:1100px){.compact-overview .overview-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:850px){.compact-overview .overview-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.compact-header{align-items:start;flex-direction:column}.compact-header h1{font-size:1.4rem}}@media(max-width:600px){.compact-overview .overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.compact-overview main{padding:16px}}@media(max-width:360px){.compact-overview .overview-grid{grid-template-columns:minmax(0,1fr)}}',
].join('\n')

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const directory = resolve(process.argv.slice(2).find(argument => !argument.startsWith('--')) ?? resolve(scriptDirectory, '../docs/live-smoke/2026-09-02'))
    const report = await renderLiveSmoke(directory)
    if (!process.argv.includes('--check')) {
      await Promise.all([
        writeFile(resolve(directory, 'report.md'), report.markdown, 'utf8'),
        writeFile(resolve(directory, 'index.html'), report.html, 'utf8'),
        writeFile(resolve(directory, 'overview.html'), report.overviewHtml, 'utf8'),
      ])
    }
    console.log(JSON.stringify({ mode: process.argv.includes('--check') ? 'check-only' : 'written', directory, ...report.stats }, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
