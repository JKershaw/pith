import type { User, UserId } from './types.ts';

/**
 * Service for managing users.
 * @deprecated Use UserRepository instead
 */
export class UserService {
  private users: Map<UserId, User> = new Map();

  /**
   * Creates a new user.
   * @param name - The user's name
   * @param email - The user's email
   * @returns The created user
   */
  createUser(name: string, email: string): User {
    const user: User = {
      id: this.generateId(),
      name,
      email,
      createdAt: new Date(),
      isActive: true,
    };
    this.users.set(user.id, user);
    return user;
  }

  /**
   * Retrieves a user by ID.
   * @param id - The user's ID
   * @returns The user or undefined
   */
  getUser(id: UserId): User | undefined {
    return this.users.get(id);
  }

  /**
   * Deactivates a user.
   * @param id - The user's ID
   * @returns Whether the operation succeeded
   */
  deactivateUser(id: UserId): boolean {
    const user = this.users.get(id);
    if (user) {
      user.isActive = false;
      return true;
    }
    return false;
  }

  private generateId(): string {
    return `user_${Date.now()}`;
  }
}
