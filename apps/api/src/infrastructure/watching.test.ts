import { describe, expect, it } from 'vitest';
import { ChatId } from '../domain/chat.js';
import { UserId } from '../domain/user.js';
import { createMemoryWatching } from './watching.js';

const ada = UserId('ada');
const team = ChatId('team');
const books = ChatId('books');

describe('watching', () => {
  it('counts someone as watching a chat until they let go', () => {
    const watching = createMemoryWatching();
    const release = watching.watch(ada, team);

    expect(watching.isWatching(ada, team)).toBe(true);
    expect(watching.isWatching(ada, books)).toBe(false);
    expect(watching.isWatching(UserId('grace'), team)).toBe(false);

    release();
    expect(watching.isWatching(ada, team)).toBe(false);
  });

  it('keeps watching while another tab still shows the chat, however often one lets go', () => {
    const watching = createMemoryWatching();
    const phone = watching.watch(ada, team);
    const laptop = watching.watch(ada, team);

    phone();
    phone();
    expect(watching.isWatching(ada, team)).toBe(true);

    laptop();
    expect(watching.isWatching(ada, team)).toBe(false);
  });
});
