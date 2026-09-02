import { defineStore } from 'pinia';
import { clearDosePlugin } from './vue-main';

const data = clearDosePlugin.data;

export const useDrugStore = defineStore('drugs', {
  state: () => ({
    searchResults: [] as Awaited<ReturnType<typeof data.search>>,
    selected: null as Awaited<ReturnType<typeof data.getDrug>> | null,
    loading: false,
    error: null as string | null
  }),
  actions: {
    async search(query: string) {
      this.loading = true;
      this.error = null;
      try { this.searchResults = await data.search(query); }
      catch (error) { this.error = error instanceof Error ? error.message : String(error); }
      finally { this.loading = false; }
    },
    async openDrug(nameOrRxcui: string, quantity = 30) {
      this.loading = true;
      this.error = null;
      try { this.selected = await data.getDrug(nameOrRxcui, { quantity, includeAdverseEventSummary: true }); }
      catch (error) { this.error = error instanceof Error ? error.message : String(error); }
      finally { this.loading = false; }
    }
  }
});
