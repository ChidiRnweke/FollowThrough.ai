import type { ActorContext, User } from '$lib/models/identity';
import type { LocalUserProvisioner, UserReader } from '$lib/server/services/identity/users';

export interface LocalIdentityController {
	initializeLocal(actor: ActorContext): Promise<User>;
}
export interface LocalIdentityDependencies {
	readonly provisioner: LocalUserProvisioner;
	readonly users: UserReader;
}

/** Establish the local profile before workspace or tool writes can use it. */
export class LocalIdentity implements LocalIdentityController {
	constructor(private readonly dependencies: LocalIdentityDependencies) {}
	async initializeLocal(actor: ActorContext): Promise<User> {
		await this.dependencies.provisioner.ensureLocal(actor);
		return this.dependencies.users.get(actor);
	}
}
