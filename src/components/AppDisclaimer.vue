<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <footer class="app-disclaimer" :class="{ 'app-disclaimer--compact': compact }">
    <div class="container app-disclaimer__inner">
      <div class="app-disclaimer__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 3.5 19 6v5.2c0 4.25-2.77 7.72-7 9.3-4.23-1.58-7-5.05-7-9.3V6l7-2.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <path d="M12 8v4.5m0 3v.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
      </div>
      <p>
        <strong>Fictional technology demo.</strong>
        ClearDose does not provide medical advice, dispense medication, process prescriptions, or provide real pharmacy pricing.
      </p>
    </div>
  </footer>
</template>
