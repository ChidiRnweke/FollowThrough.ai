import type { ActorContext, User, UserId } from '$lib/models/identity';
import type {
	CreateUserData,
	UserAccountRepository,
	UserRepository
} from '$lib/server/repositories/identity';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';

/** The users table: the bound user's account, and the sign-in lookups across every account. */
export class InMemoryUserRepository implements UserRepository, UserAccountRepository {
	constructor(private readonly actor: ActorContext) {}
	users: User[] = [];
	createOnEnsure = true;
	ensureFailure: Error | undefined;

	async findCurrent(): Promise<User | undefined> {
		return this.users.find((user) => user.id === this.actor.userId);
	}

	async ensureLocal(): Promise<void> {
		if (this.ensureFailure) throw this.ensureFailure;
		if (!this.createOnEnsure || this.users.some((user) => user.id === this.actor.userId)) return;
		this.users.push({
			id: this.actor.userId,
			email: `${this.actor.userId}@local.invalid`,
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
