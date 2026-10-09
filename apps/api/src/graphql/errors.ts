import { GraphQLError } from 'graphql';
import type { DomainError } from '../domain/errors.js';
import type { Result } from '../domain/result.js';

/** The one place domain errors become wire errors. */
export function toGraphQLError(error: DomainError): GraphQLError {
  switch (error.type) {
    case 'InvalidCredentials':
      return new GraphQLError('Invalid email or password', {
        extensions: { code: 'UNAUTHENTICATED' },
      });
    case 'InvalidInput':
      return new GraphQLError(error.reason, {
        extensions: { code: 'BAD_USER_INPUT', field: error.field },
      });
    case 'NotFound':
      return new GraphQLError(`${error.entity} not found`, {
        extensions: { code: 'NOT_FOUND' },
      });
    case 'TooManyAttempts':
      return new GraphQLError(
        'Too many attempts. Wait a few minutes and try again.',
        { extensions: { code: 'TOO_MANY_REQUESTS' } }
      );
  }
}

export function unwrap<T>(result: Result<T, DomainError>): T {
  if (result.ok) return result.value;
  throw toGraphQLError(result.error);
}

export const unauthenticated = () =>
  new GraphQLError('You must be signed in', {
    extensions: { code: 'UNAUTHENTICATED' },
  });
