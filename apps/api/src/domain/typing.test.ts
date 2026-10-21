import { describe, expect, it } from 'vitest';
import { ChatId } from './chat.js';
import { typingRecipients } from './typing.js';
import { UserId } from './user.js';

describe('typingRecipients', () => {
  it('tells everyone in the chat but the one typing', () => {
    const [ada, grace, linus] = ['ada', 'grace', 'linus'].map(UserId);
    const team = {
      kind: 'group' as const,
      id: ChatId('team'),
      title: 'Team',
      participantIds: [ada, grace, linus],
    };

    expect(typingRecipients(team, grace)).toEqual([ada, linus]);
  });
});
