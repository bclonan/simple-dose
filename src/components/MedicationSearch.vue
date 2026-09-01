<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useClearDoseActions } from '@/services/cleardose.actions'
import { useCatalogStore } from '@/stores/catalog.store'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    placeholder?: string
    buttonLabel?: string
    compact?: boolean
    required?: boolean
  }>(),
  {
    label: 'Search medications',
    placeholder: 'Search by medication, brand, strength, or form',
    buttonLabel: 'Search',
    compact: false,
    required: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: [query: string]
}>()

const catalogStore = useCatalogStore()
const clearDoseActions = useClearDoseActions()
const inputId = useId()
const internalQuery = ref(props.modelValue ?? catalogStore.searchQuery)
const query = computed({
  get: () => props.modelValue ?? internalQuery.value,
  set: (value: string) => {
    internalQuery.value = value
    emit('update:modelValue', value)
  },
})

watch(
  () => props.modelValue,
  (value) => {
    if (value !== undefined) internalQuery.value = value
  },
)

watch(
  () => catalogStore.searchQuery,
  (value) => {
    if (props.modelValue === undefined) internalQuery.value = value
  },
)

const submitSearch = (): void => {
  const submittedQuery = query.value.trim()
  clearDoseActions.searchMedications({ query: submittedQuery })
  emit('search', submittedQuery)
}
</script>

<template>
  <form
    class="medication-search"
    :class="{ 'medication-search--compact': compact }"
    role="search"
    @submit.prevent="submitSearch"
  >
    <label class="sr-only" :for="inputId">{{ label }}</label>
    <div class="medication-search__field">
      <svg
        class="medication-search__icon"
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8" />
        <path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <input
        :id="inputId"
        v-model="query"
        class="medication-search__input"
        type="search"
        name="medication-search"
        :placeholder="placeholder"
        autocomplete="off"
        enterkeyhint="search"
        :required="required"
      />
    </div>
    <button class="button button--primary medication-search__button" type="submit">
      {{ buttonLabel }}
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
        <path d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </form>
</template>
