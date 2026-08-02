import type { ActorContext, User, UserId, UserRole } from '$lib/models/identity';

export interface CreateUserData {
	email: string;
	displayName: string;
	avatarUrl?: string | null;
	role?: UserRole;
	authProvider?: string;
	authProviderId?: string;
}

/** `ensureLocal` is the single-user dev-mode bootstrap: it provisions the fixed local actor when no OIDC provider is configured, so the rest of the app never has to special-case that mode. */
export interface UserRepository {
	findById(actor: ActorContext, id: UserId): Promise<User | undefined>;
	ensureLocal(actor: ActorContext): Promise<void>;
	findByEmail(email: string): Promise<User | undefined>;
	findByAuthProviderId(providerId: string): Promise<User | undefined>;
	updateAuthProvider(userId: UserId, provider: string, providerId: string): Promise<void>;
	create(data: CreateUserData): Promise<User>;
}
