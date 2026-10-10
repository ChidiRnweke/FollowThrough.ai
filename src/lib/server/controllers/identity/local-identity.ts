import type { ActorContext } from '$lib/models/identity';
import type { LocalUserInitializer } from '$lib/server/services/identity/users';

export interface LocalIdentityController {
	localActor(): Promise<ActorContext>;
}
export interface LocalIdentityDependencies {
	readonly resolveActor: () => ActorContext;
	readonly users: LocalUserInitializer;
}
export class LocalIdentity implements LocalIdentityController {
	constructor(private readonly dependencies: LocalIdentityDependencies) {}
	async localActor(): Promise<ActorContext> {
		const actor = this.dependencies.resolveActor();
		await this.dependencies.users.initializeLocal(actor);
		return actor;
	}
}
