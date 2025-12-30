/**
 * Business logic service layer.
 */

import { formatUserName, validateEmail, hashPassword } from './utils.ts';
import type { User } from './types.ts';

/**
 * Register a new user.
 * Calls multiple utility functions from utils.ts.
 */
export function registerUser(firstName: string, lastName: string, email: string, password: string): User {
  // Validate inputs
  if (!validateEmail(email)) {
    throw new Error('Invalid email');
  }

  // Create user object
  const user: User = {
    id: generateUserId(),
    name: formatUserName(firstName, lastName),
    email: email,
    createdAt: new Date(),
    isActive: true,
  };

  // Store hashed password (in real app)
  const hashedPw = hashPassword(password);

  return user;
}

/**
 * Update user display name.
 * Calls formatUserName from utils.ts.
 */
export function updateUserName(user: User, firstName: string, lastName: string): User {
  return {
    ...user,
    name: formatUserName(firstName, lastName),
  };
}

/**
 * Internal helper - not exported.
 */
function generateUserId(): string {
  return `user_${Date.now()}`;
}
