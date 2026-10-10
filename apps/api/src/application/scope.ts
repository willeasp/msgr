import { createAuthService, type AuthService } from './auth.service.js';
import { createChatService, type ChatService } from './chat.service.js';
import { createInviteService, type InviteService } from './invite.service.js';
import {
  createLinkPreviewService,
  type LinkPreviewService,
} from './link-preview.service.js';
import { createLoaders, type LoaderOptions, type Loaders } from './loaders.js';
import {
  createMessageService,
  type MessageService,
} from './message.service.js';
import type { Dependencies } from './ports.js';
import { createUserService, type UserService } from './user.service.js';

export interface Services {
  readonly auth: AuthService;
  readonly users: UserService;
  readonly chats: ChatService;
  readonly messages: MessageService;
  readonly invites: InviteService;
  readonly linkPreviews: LinkPreviewService;
}

/** One operation's worth of application: services and loaders sharing one cache. */
export interface Scope {
  readonly services: Services;
  readonly loaders: Loaders;
}

export function createScope(deps: Dependencies, options: LoaderOptions): Scope {
  const loaders = createLoaders(deps.repositories, options);
  return {
    loaders,
    services: {
      auth: createAuthService(deps, loaders),
      users: createUserService(deps),
      chats: createChatService(deps, loaders),
      messages: createMessageService(deps, loaders),
      invites: createInviteService(deps),
      linkPreviews: createLinkPreviewService(deps, loaders),
    },
  };
}
