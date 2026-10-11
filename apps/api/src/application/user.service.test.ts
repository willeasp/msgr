import { describe, expect, it } from 'vitest';
import { SearchTerm } from '../domain/user.js';
import { createTestApp, expectOk, nextEvent } from '../testing/harness.js';
import { pictureInput } from '../testing/pictures.js';

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

describe('updating a profile', () => {
  it('saves a new name and picture, and taking the picture away', async () => {
    const { fixtures, services } = createTestApp();
    const ada = await fixtures.user({ name: 'Ada' });

    const updated = expectOk(
      await services().users.updateProfile(ada, {
        name: ' Countess ',
        avatar: pictureInput(64, 64),
      })
    );

    expect(updated).toMatchObject({
      id: ada.id,
      name: 'Countess',
      avatar: { width: 64, height: 64 },
    });
    expect(
      expectOk(
        await services().users.updateProfile(updated, {
          name: 'Countess',
          avatar: null,
        })
      )
    ).toEqual({ ...ada, name: 'Countess', avatar: null });
  });

  it('refuses a bad name or picture and changes nothing', async () => {
    const { fixtures, services, deps } = createTestApp();
    const ada = await fixtures.user({ name: 'Ada' });

    for (const input of [
      { name: '  ', avatar: null },
      { name: 'Ada', avatar: pictureInput(32, 32) },
    ]) {
      expect(await services().users.updateProfile(ada, input)).toMatchObject({
        ok: false,
        error: { type: 'InvalidInput' },
      });
    }
    expect(await deps.repositories.users.findByIds([ada.id])).toEqual([ada]);
  });

  it('tells everyone who shares a chat with them, and them, at once', async () => {
    const { fixtures, services } = createTestApp();
    const ada = await fixtures.user({ name: 'Ada' });
    const grace = await fixtures.user({ name: 'Grace' });
    const linus = await fixtures.user({ name: 'Linus' });
    await fixtures.groupChat('Pioneers', [ada, grace]);
    const toAda = nextEvent(services().users.profileChanges(ada));
    const toGrace = nextEvent(services().users.profileChanges(grace));
    const toLinus = nextEvent(services().users.profileChanges(linus));

    const updated = expectOk(
      await services().users.updateProfile(ada, {
        name: 'Countess',
        avatar: null,
      })
    );

    expect(await toAda).toEqual(updated);
    expect(await toGrace).toEqual(updated);
    expect(await toLinus).toBe('nothing');
  });
});
