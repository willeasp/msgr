import type { Brand } from './brand.js';
import type { Email, User } from './user.js';

/**
 * A user whose email is on the server's list of admins (`ADMIN_EMAILS`): they
 * may see the admin page. Minted only by `Admin.admit`.
 */
export type Admin = Brand<User, 'Admin'>;
export const Admin = {
  /** The user as an admin if their email is on the list; null for everyone else. */
  admit(user: User, admins: readonly Email[]): Admin | null {
    return admins.includes(user.email) ? (user as Admin) : null;
  },
};
