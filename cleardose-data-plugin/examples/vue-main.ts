import { createApp } from 'vue';
import App from './App.vue';
import { createClearDoseDataPlugin } from '@cleardose/data-plugin';

export const clearDosePlugin = createClearDoseDataPlugin({
  openFda: {
    // Optional but recommended for production-scale usage.
    apiKey: import.meta.env.VITE_OPENFDA_API_KEY ?? ''
  },
  nadac: {
    datasetId: 'auto'
  },
  medicare: {
    enabled: false,
    localIndexUrl: '/data/cleardose/medicare-prices.json'
  }
});

const app = createApp(App);
app.use(clearDosePlugin as any);
app.mount('#app');

// Register tools once for a page whose data actions are globally valid.
const webMcp = clearDosePlugin.registerWebMCP();
console.info('ClearDose WebMCP', webMcp);
