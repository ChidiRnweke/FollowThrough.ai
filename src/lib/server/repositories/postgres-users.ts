import { and, eq, sql } from 'drizzle-orm';
import type { ActorContext, User, UserId } from '$lib/models';
import type { CreateUserData, UserRepository } from '$lib/repositories';
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
				displayName: 'Architect',
				role: 'ADMIN'
			})
			.onConflictDoNothing();
	}

	async findByEmail(email: string): Promise<User | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.users)
			.where(eq(sql`lower(${schema.users.email})`, email.toLowerCase()));
		return row ? toUser(row) : undefined;
	}

	async findByAuthProviderId(providerId: string): Promise<User | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.users)
			.where(eq(schema.users.authProviderId, providerId));
		return row ? toUser(row) : undefined;
	}

	async updateAuthProvider(userId: UserId, provider: string, providerId: string): Promise<void> {
		await this.database
			.update(schema.users)
			.set({ authProvider: provider, authProviderId: providerId })
			.where(eq(schema.users.id, userId));
	}

	async create(data: CreateUserData): Promise<User> {
		const [row] = await this.database
			.insert(schema.users)
			.values({
				email: data.email,
				displayName: data.displayName,
				avatarUrl: data.avatarUrl ?? null,
				role: data.role ?? 'WAITING',
				authProvider: data.authProvider ?? null,
				authProviderId: data.authProviderId ?? null
			})
			.returning();
		return toUser(row);
	}
}
