import { createClearDoseDataPlugin } from '../src';

const clearDose = createClearDoseDataPlugin({ nadac: { datasetId: 'auto' } });

const search = await clearDose.data.search('omeprazole');
console.log(search);

const drug = await clearDose.data.getDrug('omeprazole', {
  quantity: 30,
  includeAdverseEventSummary: true
});
console.log(drug);

const compare = await clearDose.data.compare(['omeprazole', 'famotidine'], { quantity: 30 });
console.log(compare);
