/**
 * Represents a user in the system.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  isActive?: boolean;
}

/**
 * Authentication session data.
 */
export interface Session {
  token: string;
  userId: string;
  expiresAt: Date;
}

export type UserId = string;
