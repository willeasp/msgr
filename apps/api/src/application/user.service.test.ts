import { describe, expect, it } from 'vitest';
import { SearchTerm } from '../domain/user.js';
import { createTestApp, expectOk } from '../testing/harness.js';

describe('user search', () => {
  it('finds other people by name or email, never the viewer', async () => {
    const { fixtures, services } = createTestApp();
    const ada = await fixtures.user({ name: 'Ada Lovelace' });
    const adam = await fixtures.user({ name: 'Adam Smith' });
    const grace = await fixtures.user({
      name: 'Grace',
      email: 'grace@adastra.io',
    });

    expect(expectOk(await services().users.search(ada, ' ada '))).toEqual([
      adam,
      grace,
    ]);
  });

  it('caps the number of results', async () => {
    const { fixtures, services } = createTestApp();
    const viewer = await fixtures.user({ name: 'Viewer' });
    for (let i = 0; i < SearchTerm.RESULT_LIMIT + 5; i++) {
      await fixtures.user({ name: `Person ${String(i).padStart(2, '0')}` });
    }

    const found = expectOk(await services().users.search(viewer, 'person'));

    expect(found).toHaveLength(SearchTerm.RESULT_LIMIT);
  });

  it('rejects a blank query', async () => {
    const { fixtures, services } = createTestApp();
    const viewer = await fixtures.user({ name: 'Viewer' });

    expect(await services().users.search(viewer, '   ')).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'query' },
    });
  });
});
