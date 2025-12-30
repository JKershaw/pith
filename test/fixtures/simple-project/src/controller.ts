/**
 * Controller layer that handles HTTP requests.
 */

import { registerUser, updateUserName } from './service.ts';
import { createSession, validateToken } from './auth.ts';
import type { User, Session } from './types.ts';

/**
 * Handle user registration request.
 * Calls registerUser from service.ts and createSession from auth.ts.
 */
export async function handleRegister(
  firstName: string,
  lastName: string,
  email: string,
  password: string
): Promise<{ user: User; session: Session }> {
  // Register the user
  const user = registerUser(firstName, lastName, email, password);

  // Create a session
  const session = await createSession(user);

  return { user, session };
}

/**
 * Handle user profile update request.
 * Calls updateUserName from service.ts and validateToken from auth.ts.
 */
export function handleUpdateProfile(
  token: string,
  userId: string,
  firstName: string,
  lastName: string
): User | null {
  // Validate token
  if (!validateToken(token)) {
    return null;
  }

  // Update user name (simplified - in real app would fetch user first)
  const user: User = {
    id: userId,
    name: '',
    email: 'temp@example.com',
    createdAt: new Date(),
    isActive: true,
  };

  return updateUserName(user, firstName, lastName);
}
