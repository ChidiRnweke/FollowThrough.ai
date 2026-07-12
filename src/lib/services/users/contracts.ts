import type { ActorContext, User } from '$lib/models';
export interface UserReader {
	get(actor: ActorContext): Promise<User>;
}
