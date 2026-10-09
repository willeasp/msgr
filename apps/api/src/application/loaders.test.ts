import { describe, expect, it, vi } from 'vitest';
import { UserId } from '../domain/user.js';
import { createInMemoryRepositories } from '../testing/in-memory-repositories.js';
import { createLoaders } from './loaders.js';

async function setup(cache: boolean) {
  const { repositories, fixtures } = createInMemoryRepositories();
  const findByIds = vi.spyOn(repositories.users, 'findByIds');
  const ada = await fixtures.user({ name: 'Ada' });
  const grace = await fixtures.user({ name: 'Grace' });
  return {
    loaders: createLoaders(repositories, { cache }),
    findByIds,
    ada,
    grace,
  };
}

describe('loaders', () => {
  it('collapses one tick of lookups into one repository call', async () => {
    const { loaders, findByIds, ada, grace } = await setup(true);

    const found = await Promise.all([
      loaders.user.load(ada.id),
      loaders.user.load(grace.id),
      loaders.user.load(UserId('missing')),
    ]);

    expect(found).toEqual([ada, grace, null]);
    expect(findByIds).toHaveBeenCalledTimes(1);
  });

  it('serves repeat lookups from the cache', async () => {
    const { loaders, findByIds, ada } = await setup(true);

    await loaders.user.load(ada.id);
    await loaders.user.load(ada.id);

    expect(findByIds).toHaveBeenCalledTimes(1);
  });

  it('still batches, but re-reads, when caching is off', async () => {
    const { loaders, findByIds, ada, grace } = await setup(false);

    await Promise.all([loaders.user.load(ada.id), loaders.user.load(grace.id)]);
    await loaders.user.load(ada.id);

    expect(findByIds).toHaveBeenCalledTimes(2);
  });
});
