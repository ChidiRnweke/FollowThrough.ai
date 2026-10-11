import type { User, UserId, UserRole } from '$lib/models/identity';

export interface CreateUserData {
	email: string;
	displayName: string;
	avatarUrl?: string | null;
	role?: UserRole;
	authProvider?: string;
	authProviderId?: string;
}

/** `ensureLocal` provisions explicit test and evaluation accounts; request authentication never calls it. */
export interface UserRepository {
	/** The bound user's account. */
	findCurrent(): Promise<User | undefined>;
	ensureLocal(): Promise<void>;
}

/** Accounts looked up and created by sign-in, before any user is known. */
export interface UserAccountRepository {
	findByEmail(email: string): Promise<User | undefined>;
	findByAuthProviderId(providerId: string): Promise<User | undefined>;
	updateAuthProvider(userId: UserId, provider: string, providerId: string): Promise<void>;
	create(data: CreateUserData): Promise<User>;
}
