import { describe, expect, it } from 'vitest';
import { parseCommand } from './commands';

describe('parseCommand', () => {
  it.each([
    ['/join #general', 'general'],
    ['/join general', 'general'],
    ['  /JOIN   #Book Club  ', 'Book Club'],
  ])('reads %j as joining %j', (text, channel) => {
    expect(parseCommand(text)).toEqual({ type: 'join', channel });
  });

  it.each(['hello', '/join', '/join   ', 'see /join #general', '/shrug'])(
    'leaves %j as an ordinary message',
    (text) => {
      expect(parseCommand(text)).toBeNull();
    }
  );
});
