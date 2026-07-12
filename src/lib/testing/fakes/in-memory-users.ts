import type { ActorContext, User, UserId } from '$lib/models';
import type { UserRepository } from '$lib/repositories';
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
			createdAt: testNow,
			updatedAt: testNow
		});
	}
}
