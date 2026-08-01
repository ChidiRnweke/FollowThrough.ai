import type { ActorContext, User } from '$lib/models/identity';
import { NotFoundError } from '$lib/errors';
import type { UserRepository } from '$lib/server/repositories/identity';
export interface UserReader {
	get(actor: ActorContext): Promise<User>;
}

export class UserDirectory implements UserReader {
	constructor(private readonly users: UserRepository) {}

	async get(actor: ActorContext): Promise<User> {
		await this.users.ensureLocal(actor);
		const user = await this.users.findById(actor, actor.userId);
		if (!user) throw new NotFoundError('User was not found');
		return user;
	}
}
