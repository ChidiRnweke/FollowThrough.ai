import type { ActorContext, User } from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { UserRepository } from '$lib/repositories';
import type { UserReader } from './contracts';

export class UserManagementService implements UserReader {
	constructor(private readonly users: UserRepository) {}

	async get(actor: ActorContext): Promise<User> {
		await this.users.ensureLocal(actor);
		const user = await this.users.findById(actor, actor.userId);
		if (!user) throw new NotFoundError('User was not found');
		return user;
	}
}
