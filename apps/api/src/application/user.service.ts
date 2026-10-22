import {
  notFound,
  type InvalidInput,
  type NotFound,
} from '../domain/errors.js';
import { err, ok, type Result } from '../domain/result.js';
import { pictureVersion, type RawPicture } from '../domain/picture.js';
import { Profile, SearchTerm, UserId, type User } from '../domain/user.js';
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

    /**
     * Someone's avatar as it is now, at the version asked for; any other
     * answers as missing. Anyone signed in may see anyone's, as `search` does.
     */
    async avatar(
      viewer: User,
      userId: string,
      version: string
    ): Promise<Result<Uint8Array<ArrayBuffer>, NotFound>> {
      const [user] = await repositories.users.findByIds([UserId(userId)]);
      const avatar = user?.avatar;
      return avatar && pictureVersion(avatar) === version
        ? ok(avatar.deflated)
        : err(notFound('User'));
    },

    /** Every change to the profile of someone who shares a chat with the viewer, theirs included. */
    profileChanges(viewer: User): AsyncIterableIterator<User> {
      return profileEvents.subscribe(viewer.id);
    },
  };
}
