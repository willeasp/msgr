import { unwrapResolverError } from '@apollo/server/errors';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
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
    case 'Unavailable':
      return new GraphQLError(
        error.busy
          ? `${error.service} has had all the searches it allows this hour. Try again later.`
          : `${error.service} can’t be reached just now. Try again in a while.`,
        { extensions: { code: 'SERVICE_UNAVAILABLE' } }
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

/**
 * What a client hears of a defect (a dropped database connection, a broken
 * invariant): that something went wrong, never the defect's own words, which
 * may name hosts or data. They're logged here instead. Domain errors and
 * GraphQL's own (syntax, validation) carry a code and pass as they are.
 */
export const DEFECT = 'Something went wrong';

/** Apollo's formatError, for queries and mutations over HTTP. */
export function maskDefects(
  formatted: GraphQLFormattedError,
  error: unknown
): GraphQLFormattedError {
  if (formatted.extensions?.['code'] !== 'INTERNAL_SERVER_ERROR') {
    return formatted;
  }
  console.error(unwrapResolverError(error));
  return {
    message: DEFECT,
    path: formatted.path,
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  };
}

/** The same for subscriptions' events over the socket, whose errors carry no code yet. */
export function maskDefect(error: GraphQLError): GraphQLError {
  if (error.extensions['code'] !== undefined) return error;
  console.error(error.originalError ?? error);
  return new GraphQLError(DEFECT, {
    path: error.path,
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  });
}
