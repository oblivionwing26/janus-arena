import { describePersonaCatalogContract } from '../../test-support/persona-catalog-contract.js';
import { InMemoryPersonaCatalog } from './in-memory-persona-catalog.js';

describePersonaCatalogContract('InMemoryPersonaCatalog', (personas) =>
  Promise.resolve(new InMemoryPersonaCatalog(personas)),
);
