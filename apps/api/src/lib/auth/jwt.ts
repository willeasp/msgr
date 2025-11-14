import * as jose from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'very-secret-key-for-development';

export async function signJWT(
  payload: jose.JWTPayload,
  options?: { expiresIn?: string }
): Promise<string> {
  const secretKey = new TextEncoder().encode(JWT_SECRET);

  const jwt = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(options?.expiresIn || '2h')
    .sign(secretKey);

  return jwt;
}

export async function verifyJWT(token: string): Promise<jose.JWTPayload> {
  const secretKey = new TextEncoder().encode(JWT_SECRET);

  try {
    const { payload } = await jose.jwtVerify(token, secretKey);
    return payload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}
