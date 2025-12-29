import type { User, Session } from './types.ts';

/**
 * Creates a new session for a user.
 * @param user - The user to create a session for
 * @returns A promise that resolves to the new session
 * @throws Error if the user is not active
 */
export async function createSession(user: User): Promise<Session> {
  if (!user.isActive) {
    throw new Error('User is not active');
  }

  return {
    token: generateToken(),
    userId: user.id,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

/**
 * Validates a session token.
 * @param token - The token to validate
 * @returns Whether the token is valid
 */
export function validateToken(token: string): boolean {
  // TODO: Implement actual token validation
  return token.length > 0;
}

function generateToken(): string {
  return Math.random().toString(36).substring(2);
}

// Helper constant
const SESSION_DURATION = 24 * 60 * 60 * 1000;

export { SESSION_DURATION };
