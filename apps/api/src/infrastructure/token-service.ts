import { jwtVerify, SignJWT } from 'jose';
import type { TokenService } from '../application/ports.js';
import { UserId, type SessionToken } from '../domain/user.js';

const ALGORITHM = 'HS256';

export function createJwtTokenService(options: {
  readonly secret: string;
  readonly ttlSeconds: number;
}): TokenService {
  const key = new TextEncoder().encode(options.secret);
  return {
    async issue(userId) {
      const token = await new SignJWT()
        .setProtectedHeader({ alg: ALGORITHM })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime(`${options.ttlSeconds}s`)
        .sign(key);
      return token as SessionToken;
    },

    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: [ALGORITHM],
        });
        return typeof payload.sub === 'string' ? UserId(payload.sub) : null;
      } catch {
        return null;
      }
    },
  };
}
