import type { InvalidInput } from '../domain/errors.js';
import { ok, type Result } from '../domain/result.js';
import { SearchTerm, type User } from '../domain/user.js';
import type { Dependencies } from './ports.js';

export type UserService = ReturnType<typeof createUserService>;

export function createUserService({ repositories }: Dependencies) {
  return {
    /** People the viewer could start a chat with. Never includes the viewer. */
    async search(
      viewer: User,
      query: string
    ): Promise<Result<User[], InvalidInput>> {
      const term = SearchTerm.parse(query);
      if (!term.ok) return term;
      return ok(
        await repositories.users.search(term.value, {
          excluding: viewer.id,
          limit: SearchTerm.RESULT_LIMIT,
        })
      );
    },
  };
}
