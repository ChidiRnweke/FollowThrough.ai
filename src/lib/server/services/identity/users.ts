import type { ActorContext, User } from '$lib/models/identity';
import { NotFoundError } from '$lib/errors';
import type { UserRepository } from '$lib/server/repositories/identity';
export interface UserReader {
	get(actor: ActorContext): Promise<User>;
}

export interface LocalUserProvisioner {
	ensureLocal(actor: ActorContext): Promise<void>;
}

export class UserDirectory implements UserReader, LocalUserProvisioner {
	constructor(private readonly users: UserRepository) {}

	ensureLocal(actor: ActorContext): Promise<void> {
		return this.users.ensureLocal(actor);
	}

	async get(actor: ActorContext): Promise<User> {
		const user = await this.users.findById(actor, actor.userId);
		if (!user) throw new NotFoundError('User was not found');
		return user;
	}
}
