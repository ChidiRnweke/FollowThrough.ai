import type { ActorContext, User, UserId } from '../models';
export interface UserRepository {
	findById(actor: ActorContext, id: UserId): Promise<User | undefined>;
	ensureLocal(actor: ActorContext): Promise<void>;
}
