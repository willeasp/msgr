/** Every way a use case can fail that the caller is expected to handle. */
export type DomainError = InvalidCredentials | InvalidInput | NotFound;

export type InvalidCredentials = { readonly type: 'InvalidCredentials' };

export type InvalidInput = {
  readonly type: 'InvalidInput';
  readonly field: string;
  readonly reason: string;
};

export type NotFound = {
  readonly type: 'NotFound';
  readonly entity: 'Chat' | 'User';
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
