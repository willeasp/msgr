import { describe } from 'vitest';
import { createInMemoryRepositories } from './in-memory-repositories.js';
import { repositoryContract } from './repository-contract.js';

describe('in-memory repositories', () => {
  repositoryContract(async () => createInMemoryRepositories());
});
