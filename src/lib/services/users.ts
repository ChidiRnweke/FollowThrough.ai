import type { ActorContext, User } from '../models';
export interface UserReader {
	get(actor: ActorContext): Promise<User>;
}
