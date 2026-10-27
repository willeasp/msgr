/** Every way a use case can fail that the caller is expected to handle. */
export type DomainError =
  | InvalidCredentials
  | InvalidInput
  | NotFound
  | TooManyAttempts
  | Unavailable;

export type InvalidCredentials = { readonly type: 'InvalidCredentials' };

export type InvalidInput = {
  readonly type: 'InvalidInput';
  readonly field: string;
  readonly reason: string;
};

export type NotFound = {
  readonly type: 'NotFound';
  readonly entity: 'Chat' | 'Invite' | 'Message' | 'User';
};

/** Someone is guessing: the same thing was tried too often, too quickly. */
export type TooManyAttempts = { readonly type: 'TooManyAttempts' };

/** A service the app asks on the viewer's behalf can't answer now: GIPHY, busy (its hourly allowance used) or down. */
export type Unavailable = {
  readonly type: 'Unavailable';
  readonly service: 'GIPHY';
  readonly busy: boolean;
};

export const invalidCredentials = (): InvalidCredentials => ({
  type: 'InvalidCredentials',
});

export const invalidInput = (field: string, reason: string): InvalidInput => ({
  type: 'InvalidInput',
  field,
  reason,
});

export const notFound = (entity: NotFound['entity']): NotFound => ({
  type: 'NotFound',
  entity,
});

export const tooManyAttempts = (): TooManyAttempts => ({
  type: 'TooManyAttempts',
});

export const unavailable = (
  service: Unavailable['service'],
  busy: boolean
): Unavailable => ({ type: 'Unavailable', service, busy });
