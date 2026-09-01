<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppDisclaimer from './components/AppDisclaimer.vue'
import AppHeader from './components/AppHeader.vue'
import CartDrawer from './components/CartDrawer.vue'
import WebMCPBadge from './components/WebMCPBadge.vue'
import WebMCPDrawer from './components/WebMCPDrawer.vue'
import { router } from './router'
import { useWebMcpStore } from './stores/webmcp.store'
import { registerClearDoseTools, type ClearDoseToolRegistration } from './webmcp/register'

const webmcp = useWebMcpStore()
const webmcpDrawerOpen = ref(false)
let registration: ClearDoseToolRegistration | undefined
let unmounted = false

onMounted(async () => {
  const nextRegistration = await registerClearDoseTools({
    navigate: (path) => router.push(path),
  })
  if (unmounted) nextRegistration.dispose()
  else registration = nextRegistration
})

onBeforeUnmount(() => {
  unmounted = true
  registration?.dispose()
})
</script>

<template>
  <div class="app-frame">
    <AppHeader />
    <RouterView />
    <AppDisclaimer />
    <CartDrawer />
    <WebMCPBadge
      :status="webmcp.status"
      :count="webmcp.registeredToolCount"
      @open="webmcpDrawerOpen = true"
    />
    <WebMCPDrawer :open="webmcpDrawerOpen" @close="webmcpDrawerOpen = false" />
  </div>
</template>
