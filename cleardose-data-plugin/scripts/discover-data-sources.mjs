const year = Number(process.argv[2] ?? new Date().getFullYear());

async function discoverNadac() {
  const items = await fetch('https://data.medicaid.gov/api/1/metastore/schemas/dataset/items').then(r => r.json());
  const expected = `NADAC (National Average Drug Acquisition Cost) ${year}`.toLowerCase();
  const match = items.find(x => x.title?.toLowerCase() === expected)
    ?? items.find(x => x.title?.toLowerCase().includes('nadac') && x.title?.includes(String(year)));
  return match ? { title: match.title, identifier: match.identifier, modified: match.modified } : null;
}

async function discoverCms() {
  const catalog = await fetch('https://data.cms.gov/data.json').then(r => r.json());
  const quarterly = catalog.dataset?.find(x => x.title === 'Quarterly Prescription Drug Plan Formulary, Pharmacy Network, and Pricing Information');
  const spending = catalog.dataset?.find(x => x.title === 'Medicare Part D Spending by Drug');
  return {
    quarterly: quarterly ? {
      modified: quarterly.modified,
      distributions: quarterly.distribution?.map(d => ({ title: d.title, mediaType: d.mediaType, downloadURL: d.downloadURL })).slice(0, 6)
    } : null,
    spending: spending ? {
      modified: spending.modified,
      distributions: spending.distribution?.map(d => ({ title: d.title, mediaType: d.mediaType, downloadURL: d.downloadURL })).slice(0, 6)
    } : null
  };
}

console.log(JSON.stringify({ year, nadac: await discoverNadac(), cms: await discoverCms() }, null, 2));
