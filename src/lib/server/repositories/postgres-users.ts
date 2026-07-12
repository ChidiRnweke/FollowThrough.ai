import { and, eq } from 'drizzle-orm';
import type { ActorContext, User, UserId } from '$lib/models';
import type { UserRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toUser } from '../domain/mappers';

export class PostgresUserRepository implements UserRepository {
	constructor(private readonly database: Database) {}

	async findById(actor: ActorContext, id: UserId): Promise<User | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.users)
			.where(and(eq(schema.users.id, id), eq(schema.users.id, actor.userId)));
		return row ? toUser(row) : undefined;
	}

	async ensureLocal(actor: ActorContext): Promise<void> {
		await this.database
			.insert(schema.users)
			.values({
				id: actor.userId,
				email: `${actor.userId}@local.invalid`,
				displayName: 'Architect'
			})
			.onConflictDoNothing();
	}
}
