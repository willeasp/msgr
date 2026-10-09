import { describe, expect, it } from 'vitest';
import {
  ChatId,
  counterpart,
  directPair,
  visibleTo,
  type DirectChat,
  type GroupChat,
} from './chat.js';
import { UserId } from './user.js';

const ada = UserId('ada');
const grace = UserId('grace');
const linus = UserId('linus');

const direct: DirectChat = {
  kind: 'direct',
  id: ChatId('direct'),
  participantIds: [ada, grace],
};
const group: GroupChat = {
  kind: 'group',
  id: ChatId('group'),
  title: 'Team',
  participantIds: [ada, grace, linus],
};

describe('directPair', () => {
  it('gives both sides of a pair the same key and sorted participants', () => {
    const fromAda = directPair(ada, grace);
    const fromGrace = directPair(grace, ada);

    expect(fromAda).toEqual(fromGrace);
    expect(fromAda).toEqual({
      ok: true,
      value: { key: 'ada:grace', participantIds: [ada, grace] },
    });
  });

  it('refuses a chat with yourself', () => {
    expect(directPair(ada, ada)).toEqual({
      ok: false,
      error: {
        type: 'InvalidInput',
        field: 'participantId',
        reason: 'You cannot start a chat with yourself',
      },
    });
  });
});

describe('counterpart', () => {
  it('is the other participant, from either side', () => {
    expect(counterpart(direct, ada)).toBe(grace);
    expect(counterpart(direct, grace)).toBe(ada);
  });
});

describe('visibleTo', () => {
  it('shows a chat to its participants', () => {
    expect(visibleTo(group, linus)).toEqual({ ok: true, value: group });
  });

  it('reports a chat the viewer is not in exactly like a missing one', () => {
    const notFound = { ok: false, error: { type: 'NotFound', entity: 'Chat' } };
    expect(visibleTo(direct, linus)).toEqual(notFound);
    expect(visibleTo(null, linus)).toEqual(notFound);
  });
});
