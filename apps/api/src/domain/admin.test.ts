import { describe, expect, it } from 'vitest';
import { Admin } from './admin.js';
import { Email, UserId, type User } from './user.js';

const email = (raw: string) => {
  const parsed = Email.parse(raw);
  if (!parsed.ok) throw new Error(raw);
  return parsed.value;
};

const ada: User = {
  id: UserId('ada'),
  email: email('ada@example.com'),
  name: 'Ada',
  avatar: null,
};

describe('Admin', () => {
  it('admits someone on the list', () => {
    expect(Admin.admit(ada, [email('Ada@Example.com')])).toBe(ada);
  });

  it('admits nobody else, and nobody at all from an empty list', () => {
    expect(Admin.admit(ada, [email('grace@example.com')])).toBeNull();
    expect(Admin.admit(ada, [])).toBeNull();
  });
});
