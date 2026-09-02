import type { ClearDoseDataService } from '../service';

export interface WebMcpRegistration {
  supported: boolean;
  toolNames: string[];
  unregister(): void;
}

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute(args: any): Promise<any> | any;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool(tool: Tool, options?: { signal?: AbortSignal }): void;
    };
  }
}

function result(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

export function createClearDoseWebMcpTools(data: ClearDoseDataService, prefix = 'cleardose_'): Tool[] {
  return [
    {
      name: `${prefix}search_drugs`,
      description: 'Search public medication records by generic or brand name. Returns normalized FDA/RxNorm-backed results.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Generic or brand drug name.' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 }
        },
        required: ['query'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute({ query, limit = 20 }) { return result(await data.search(query, { limit })); }
    },
    {
      name: `${prefix}get_drug`,
      description: 'Get normalized drug product and FDA label information, plus public pricing benchmarks when available.',
      inputSchema: {
        type: 'object',
        properties: {
          drug: { type: 'string', description: 'Generic name, brand name, or RxCUI.' },
          quantity: { type: 'integer', minimum: 1, maximum: 1000, default: 30 },
          includeAdverseEventSummary: { type: 'boolean', default: false }
        },
        required: ['drug'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute({ drug, quantity = 30, includeAdverseEventSummary = false }) {
        return result(await data.getDrug(drug, { quantity, includeAdverseEventSummary }));
      }
    },
    {
      name: `${prefix}get_drug_interactions`,
      description: 'Return the drug-interactions section from FDA labeling for a medication. This is label text, not a pairwise clinical interaction engine.',
      inputSchema: {
        type: 'object',
        properties: { drug: { type: 'string' } },
        required: ['drug'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute({ drug }) { return result(await data.getInteractions(drug)); }
    },
    {
      name: `${prefix}get_drug_side_effects`,
      description: 'Return adverse-reaction information from FDA labeling for a medication.',
      inputSchema: {
        type: 'object',
        properties: { drug: { type: 'string' } },
        required: ['drug'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute({ drug }) { return result(await data.getSideEffects(drug)); }
    },
    {
      name: `${prefix}get_drug_warnings`,
      description: 'Return FDA boxed warnings, warnings, and contraindications for a medication.',
      inputSchema: {
        type: 'object',
        properties: { drug: { type: 'string' } },
        required: ['drug'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute({ drug }) { return result(await data.getWarnings(drug)); }
    },
    {
      name: `${prefix}get_drug_indications`,
      description: 'Return FDA-labeled indications and usage text for a medication.',
      inputSchema: {
        type: 'object',
        properties: { drug: { type: 'string' } },
        required: ['drug'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute({ drug }) { return result(await data.getIndications(drug)); }
    },
    {
      name: `${prefix}get_reported_adverse_events`,
      description: 'Return a compact FAERS reported-adverse-event reaction count summary for a medication. Counts are reports, not incidence rates or proof of causation.',
      inputSchema: {
        type: 'object',
        properties: { drug: { type: 'string' } },
        required: ['drug'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute({ drug }) {
        const value = await data.getDrug(drug, { includeClinical: false, includePrices: false, includeAdverseEventSummary: true });
        return result(value.reportedAdverseEvents ?? []);
      }
    },
    {
      name: `${prefix}get_drug_prices`,
      description: 'Get public drug pricing context. NADAC results are acquisition-cost benchmarks, not patient cash prices.',
      inputSchema: {
        type: 'object',
        properties: {
          drug: { type: 'string' },
          quantity: { type: 'integer', minimum: 1, maximum: 1000, default: 30 }
        },
        required: ['drug'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute({ drug, quantity = 30 }) { return result(await data.getPrices(drug, quantity)); }
    },
    {
      name: `${prefix}compare_drugs`,
      description: 'Compare two or more drugs using the same normalized public-data model used by the ClearDose human interface.',
      inputSchema: {
        type: 'object',
        properties: {
          drugs: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string' } },
          quantity: { type: 'integer', minimum: 1, maximum: 1000, default: 30 }
        },
        required: ['drugs'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      async execute({ drugs, quantity = 30 }) { return result(await data.compare(drugs, { quantity })); }
    },
    {
      name: `${prefix}data_sources`,
      description: 'Show which public ClearDose data providers are enabled and how they are loaded.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      async execute() { return result(await data.sourceStatus()); }
    }
  ];
}

export function registerClearDoseWebMcpTools(
  data: ClearDoseDataService,
  options: { prefix?: string } = {}
): WebMcpRegistration {
  const ctx = typeof document !== 'undefined' ? document.modelContext : undefined;
  const tools = createClearDoseWebMcpTools(data, options.prefix ?? 'cleardose_');
  if (!ctx?.registerTool) return { supported: false, toolNames: tools.map(t => t.name), unregister() {} };

  const controller = new AbortController();
  for (const tool of tools) ctx.registerTool(tool, { signal: controller.signal });
  return {
    supported: true,
    toolNames: tools.map(t => t.name),
    unregister() { controller.abort(); }
  };
}
