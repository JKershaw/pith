/**
 * Utility functions for the application.
 */

/**
 * Format a user's display name.
 */
export function formatUserName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`;
}

/**
 * Validate an email address.
 */
export function validateEmail(email: string): boolean {
  return email.includes('@');
}

/**
 * Hash a password (simplified).
 */
export function hashPassword(password: string): string {
  return `hashed_${password}`;
}

/**
 * Not exported - internal helper.
 */
function sanitizeInput(input: string): string {
  return input.trim();
}
