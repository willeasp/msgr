import { describe, expect, it } from 'vitest';
import type { StorageUsage } from '../domain/storage.js';
import type { Email } from '../domain/user.js';
import { createTestApp, fakeStorageGauge } from '../testing/harness.js';

const usage: StorageUsage = {
  databaseBytes: 400,
  tables: [{ name: 'Message', bytes: 300 }],
  contents: [{ kind: 'picture', count: 2, bytes: 100 }],
};

async function adaIsAdmin() {
  const app = createTestApp({
    admins: ['ada@example.com' as Email],
    storageGauge: fakeStorageGauge(usage),
    storageLimit: 1000,
  });
  const ada = await app.fixtures.user({ name: 'Ada' });
  const grace = await app.fixtures.user({ name: 'Grace' });
  return { ada, grace, admin: app.services().admin };
}

describe('admin', () => {
  it('admits only the people on the list', async () => {
    const { ada, grace, admin } = await adaIsAdmin();

    expect(admin.admit(ada)).toBe(ada);
    expect(admin.admit(grace)).toBeNull();
  });

  it("reports how full the database is against the plan's allowance", async () => {
    const { ada, admin } = await adaIsAdmin();
    const admitted = admin.admit(ada);
    if (!admitted) throw new Error('Ada is an admin');

    expect(await admin.storage(admitted)).toEqual({
      ...usage,
      limitBytes: 1000,
      freeBytes: 600,
    });
  });
});
