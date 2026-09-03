<script setup lang="ts">
import { computed } from 'vue'
import { useWebMcpStore } from '../../stores/webmcp.store'
import { useAgentActivityStore } from '../../stores/agentActivity.store'
import type { ToolDocumentation } from '../../webmcp/documentation'
const props = defineProps<{ tools: ToolDocumentation[] }>()
const webmcp = useWebMcpStore()
const activity = useAgentActivityStore()
const latest = computed(() => activity.entries[0])
const invalid = computed(() => props.tools.filter(tool => tool.validationErrors.length))
</script>
<template>
  <section id="tool-inspector" class="inspector" aria-labelledby="inspector-heading">
    <p class="section-kicker">This browser, right now</p><h2 id="inspector-heading">Live tool inspector</h2>
    <dl class="inspector__stats">
      <div><dt>Browser status</dt><dd>{{ webmcp.status }}</dd></div>
      <div><dt>Registered tools</dt><dd data-testid="registered-tool-count">{{ webmcp.registeredToolCount }}</dd></div>
      <div><dt>Documented definitions</dt><dd>{{ tools.length }}</dd></div>
      <div><dt>Example validation</dt><dd>{{ invalid.length ? `${invalid.length} need review` : `${tools.length} / ${tools.length} pass` }}</dd></div>
    </dl>
    <p v-if="webmcp.status === 'unsupported'">Native WebMCP is unavailable in this browser. You can still read every definition, copy prompts, preview examples and use the application by hand. Safe local examples are labeled separately from native calls.</p>
    <p v-else-if="webmcp.status === 'ready-unverified'">The browser accepted registration but does not expose discovery. These names are not independently verified discovery results.</p>
    <p v-else-if="webmcp.status === 'ready'">The app verified these names against browser discovery. Registration stays in the app shell when you change routes.</p>
    <p v-if="webmcp.registrationError" role="status">{{ webmcp.registrationError }}</p>
    <p>Schema validation checks current example arguments, including dynamic IDs and revision tokens. Runtime handlers still validate every real call.</p>
    <details><summary>Registered tool names</summary><ul><li v-for="name in webmcp.registeredToolNames" :key="name"><a :href="`#tool-${name}`"><code>{{ name }}</code></a></li></ul><p v-if="!webmcp.registeredToolCount">No native tools registered in this browser.</p></details>
    <div class="inspector__latest"><h3>Most recent tool call</h3>
      <template v-if="latest"><p><code>{{ latest.toolName }}</code> · {{ latest.status }} · {{ latest.source }} · <time :datetime="latest.timestamp">{{ new Date(latest.timestamp).toLocaleString() }}</time></p>
        <details><summary>Arguments and saved result summary</summary><p>The activity store redacts sensitive fields and bounds large results. This is not a full clinical record.</p><pre>{{ JSON.stringify({ input: latest.input, result: latest.outputSummary, error: latest.error }, null, 2) }}</pre></details>
      </template><p v-else>No tool calls in this session yet.</p>
    </div>
  </section>
</template>
<style scoped>
.inspector { padding: clamp(1rem, 3vw, 2rem); background: #fff; border: 1px solid var(--cd-border); border-radius: 20px; scroll-margin-top: 7rem; }
.inspector__stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
dt { color: var(--cd-muted); font-size: .85rem; } dd { margin: .3rem 0; font-size: 1.3rem; font-weight: 750; overflow-wrap: anywhere; }
summary { cursor: pointer; font-weight: 650; } li { overflow-wrap: anywhere; margin-top: .4rem; }
.inspector__latest { border-top: 1px solid var(--cd-border); margin-top: 1rem; padding-top: 1rem; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 24rem; overflow: auto; font-size: .8rem; }
@media(max-width: 700px) { .inspector__stats { grid-template-columns: 1fr 1fr; } }
</style>
