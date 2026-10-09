import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';

export const DateTime = new GraphQLScalarType<Date, string>({
  name: 'DateTime',
  serialize(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }
    throw new GraphQLError('DateTime can only serialize a valid Date');
  },
  parseValue: parseIsoDate,
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError('DateTime must be an ISO-8601 string');
    }
    return parseIsoDate(ast.value);
  },
});

function parseIsoDate(value: unknown): Date {
  const date = typeof value === 'string' ? new Date(value) : null;
  if (date === null || Number.isNaN(date.getTime())) {
    throw new GraphQLError('DateTime must be an ISO-8601 string');
  }
  return date;
}
