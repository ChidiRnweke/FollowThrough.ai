import type { ActorContext, User, UserId } from '$lib/models';
import type { CreateUserData, UserRepository } from '$lib/repositories';
import { testNow } from '$lib/testing/fixtures/domain-builders';

export class InMemoryUserRepository implements UserRepository {
	users: User[] = [];
	createOnEnsure = true;

	async findById(actor: ActorContext, id: UserId): Promise<User | undefined> {
		return this.users.find((user) => user.id === id && user.id === actor.userId);
	}

	async ensureLocal(actor: ActorContext): Promise<void> {
		if (!this.createOnEnsure || this.users.some((user) => user.id === actor.userId)) return;
		this.users.push({
			id: actor.userId,
			email: `${actor.userId}@local.invalid`,
			displayName: 'Architect',
			role: 'ADMIN',
			createdAt: testNow,
			updatedAt: testNow
		});
	}

	async findByEmail(email: string): Promise<User | undefined> {
		return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
	}

	async findByAuthProviderId(providerId: string): Promise<User | undefined> {
		return this.users.find((user) => user.authProviderId === providerId);
	}

	async updateAuthProvider(userId: UserId, provider: string, providerId: string): Promise<void> {
		const user = this.users.find((u) => u.id === userId);
		if (user) {
			const idx = this.users.indexOf(user);
			this.users[idx] = { ...user, authProvider: provider, authProviderId: providerId };
		}
	}

	async create(data: CreateUserData): Promise<User> {
		const user: User = {
			id: crypto.randomUUID() as UserId,
			email: data.email,
			displayName: data.displayName,
			avatarUrl: undefined,
			role: data.role ?? 'WAITING',
			authProvider: data.authProvider,
			authProviderId: data.authProviderId,
			createdAt: testNow,
			updatedAt: testNow
		};
		this.users.push(user);
		return user;
	}
}
