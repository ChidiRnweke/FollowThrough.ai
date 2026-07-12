import type { ActorContext, User } from '../models';
import { NotFoundError } from '../models';
import type { UserRepository } from '../repositories';
import type { UserReader } from './users';

export class UserManagementService implements UserReader {
	constructor(private readonly users: UserRepository) {}

	async get(actor: ActorContext): Promise<User> {
		await this.users.ensureLocal(actor);
		const user = await this.users.findById(actor, actor.userId);
		if (!user) throw new NotFoundError('User was not found');
		return user;
	}
}
