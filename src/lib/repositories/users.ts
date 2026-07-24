import type { ActorContext, User, UserId, UserRole } from '../models';

export interface CreateUserData {
	email: string;
	displayName: string;
	avatarUrl?: string | null;
	role?: UserRole;
	authProvider?: string;
	authProviderId?: string;
}

export interface UserRepository {
	findById(actor: ActorContext, id: UserId): Promise<User | undefined>;
	ensureLocal(actor: ActorContext): Promise<void>;
	findByEmail(email: string): Promise<User | undefined>;
	findByAuthProviderId(providerId: string): Promise<User | undefined>;
	updateAuthProvider(userId: UserId, provider: string, providerId: string): Promise<void>;
	create(data: CreateUserData): Promise<User>;
}
