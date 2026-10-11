import type { User } from '$lib/models/identity';
import { NotFoundError } from '$lib/errors';
import type { UserRepository } from '$lib/server/repositories/identity';
export interface UserReader {
	get(): Promise<User>;
}

export interface LocalUserProvisioner {
	ensureLocal(): Promise<void>;
}

export class UserDirectory implements UserReader, LocalUserProvisioner {
	constructor(private readonly users: UserRepository) {}

	ensureLocal(): Promise<void> {
		return this.users.ensureLocal();
	}

	async get(): Promise<User> {
		const user = await this.users.findCurrent();
		if (!user) throw new NotFoundError('User was not found');
		return user;
	}
}
