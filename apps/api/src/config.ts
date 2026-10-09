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
}

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const DEVELOPMENT_SECRET = 'msgr-development-only-secret-0123456789';

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

  if (problems.length > 0) return err(problems);
  return ok({
    port,
    corsOrigin,
    jwtSecret,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    secureCookies: production,
    staticDir: env['STATIC_DIR'] || null,
  });
}
