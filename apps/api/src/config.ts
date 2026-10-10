import { err, ok, type Result } from './domain/result.js';

export interface Config {
  readonly port: number;
  /**
   * The one browser origin allowed to call the API with credentials, over
   * HTTP and WebSocket: in production, the address people open the app at.
   */
  readonly corsOrigin: string;
  readonly jwtSecret: string;
  readonly sessionTtlSeconds: number;
  readonly secureCookies: boolean;
  /** The built frontend, served from the API's own address; `null` serves only the API. */
  readonly staticDir: string | null;
  /** Web Push's VAPID keys, and who signs with them; null turns push off. */
  readonly push: {
    readonly publicKey: string;
    readonly privateKey: string;
    readonly subject: string;
  } | null;
}

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const DEVELOPMENT_SECRET = 'msgr-development-only-secret-0123456789';
// Development's own push keys, like its JWT secret: useless anywhere else.
const DEVELOPMENT_VAPID = {
  publicKey:
    'BHdgRT9dGCZv-REtiHJtRv-vcQMexFE3rhRYq5_8EIqBR2zDLtUJ2SVOz2LBEq8Lone3iCmqO_W-uHT5C6eDLJ8',
  privateKey: 'Sy7TpkdTQnDIi_pqCnRTZegtIR265nJb2gFLqGF16kw',
};
const VAPID_PUBLIC = /^[A-Za-z0-9_-]{87}$/;
const VAPID_PRIVATE = /^[A-Za-z0-9_-]{43}$/;

/** Reads the environment once, at boot. Every problem is reported, not just the first. */
export function parseConfig(
  env: Readonly<Record<string, string | undefined>>
): Result<Config, string[]> {
  const production = env['NODE_ENV'] === 'production';
  const problems: string[] = [];

  const port = Number(env['PORT'] ?? 4000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    problems.push('PORT must be an integer from 0 to 65535');
  }

  const jwtSecret = env['JWT_SECRET'] ?? (production ? '' : DEVELOPMENT_SECRET);
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    problems.push(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters` +
        (production ? ' and is required in production' : '')
    );
  }

  // Render tells each web service its own public address.
  const corsOrigin =
    env['CORS_ORIGIN'] ??
    env['RENDER_EXTERNAL_URL'] ??
    (production ? '' : 'http://localhost:4200');
  if (!corsOrigin) {
    problems.push(
      'CORS_ORIGIN, the address people open the app at, is required in production'
    );
  }

  const publicKey =
    env['VAPID_PUBLIC_KEY'] ?? (production ? '' : DEVELOPMENT_VAPID.publicKey);
  const privateKey =
    env['VAPID_PRIVATE_KEY'] ??
    (production ? '' : DEVELOPMENT_VAPID.privateKey);
  if (!publicKey !== !privateKey) {
    problems.push(
      'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY go together: set both, or neither to turn push off'
    );
  } else if (
    publicKey &&
    !(VAPID_PUBLIC.test(publicKey) && VAPID_PRIVATE.test(privateKey))
  ) {
    problems.push(
      'VAPID keys must be base64url, as `npx web-push generate-vapid-keys` prints them'
    );
  }

  if (problems.length > 0) return err(problems);
  return ok({
    port,
    corsOrigin,
    jwtSecret,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    secureCookies: production,
    staticDir: env['STATIC_DIR'] || null,
    push:
      publicKey && privateKey
        ? { publicKey, privateKey, subject: corsOrigin }
        : null,
  });
}
