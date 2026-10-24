import { GraphQLError } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import { notFound } from '../domain/errors.js';
import { DEFECT, maskDefect, toGraphQLError } from './errors.js';

describe("a subscription event's errors", () => {
  it("keep a domain error's words, and hide a defect's", () => {
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const domain = toGraphQLError(notFound('Chat'));
      expect(maskDefect(domain)).toBe(domain);

      const defect = new GraphQLError('Lost db.secret:5432', {
        path: ['messageReceived', 'sender'],
        originalError: new Error('Lost db.secret:5432'),
      });
      const masked = maskDefect(defect);
      expect(masked.message).toBe(DEFECT);
      expect(masked.path).toEqual(['messageReceived', 'sender']);
      expect(masked.extensions).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
      expect(String(logged.mock.calls[0]?.[0])).toContain('db.secret');
    } finally {
      logged.mockRestore();
    }
  });
});
