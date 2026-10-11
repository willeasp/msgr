import type { InvalidInput } from '../domain/errors.js';
import { ok, type Result } from '../domain/result.js';
import type { RawPicture } from '../domain/picture.js';
import { Profile, SearchTerm, type User } from '../domain/user.js';
import type { Dependencies } from './ports.js';

export type UserService = ReturnType<typeof createUserService>;

export function createUserService({
  repositories,
  pictures,
  profileEvents,
}: Dependencies) {
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

    /**
     * Replaces the viewer's name and picture (null for the default), and
     * tells them and everyone who shares a chat with them.
     */
    async updateProfile(
      viewer: User,
      input: { readonly name: string; readonly avatar: RawPicture | null }
    ): Promise<Result<User, InvalidInput>> {
      const profile = Profile.parse(input, pictures);
      if (!profile.ok) return profile;
      const user = await repositories.users.saveProfile(
        viewer.id,
        profile.value
      );
      const chats = await repositories.chats.findByParticipant(viewer.id);
      const everyone = new Set([
        viewer.id,
        ...chats.flatMap((chat) => chat.participantIds),
      ]);
      await profileEvents.publish(user, [...everyone]);
      return ok(user);
    },

    /** Every change to the profile of someone who shares a chat with the viewer, theirs included. */
    profileChanges(viewer: User): AsyncIterableIterator<User> {
      return profileEvents.subscribe(viewer.id);
    },
  };
}
