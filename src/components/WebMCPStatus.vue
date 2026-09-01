<script setup lang="ts">
import { computed } from 'vue'
import { useWebMcpStore } from '../stores/webmcp.store'

const webmcp = useWebMcpStore()
const label = computed(() => {
  if (webmcp.status === 'ready') return `${webmcp.registeredToolCount} tools registered`
  if (webmcp.status === 'ready-unverified') return `${webmcp.registeredToolCount} tools registered, discovery unavailable`
  if (webmcp.status === 'degraded') return `${webmcp.registeredToolCount} of 11 tools verified`
  if (webmcp.status === 'registering') return 'Registering tools'
  if (webmcp.status === 'error') return 'Tool registration failed'
  if (webmcp.status === 'unsupported') return 'WebMCP unavailable in this browser'
  return 'WebMCP status pending'
})
</script>

<template>
  <div class="webmcp-status" :class="`webmcp-status--${webmcp.status}`" aria-live="polite">
    <span class="status-dot" aria-hidden="true"></span>
    <div>
      <strong>{{ label }}</strong>
      <span v-if="webmcp.status === 'unsupported'">The ClearDose site remains fully functional.</span>
      <span v-else-if="webmcp.registrationError">{{ webmcp.registrationError }}</span>
      <span v-else-if="webmcp.status === 'ready-unverified'">Registration completed, but this browser cannot list the exposed tools.</span>
      <span v-else-if="webmcp.status === 'ready'">Verified against the tools currently exposed by this page.</span>
      <span v-else-if="webmcp.status === 'registering'">Registering the page tools now.</span>
      <span v-else>Registration has not started.</span>
    </div>
  </div>
</template>
