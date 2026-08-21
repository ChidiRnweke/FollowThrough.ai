import { eq } from 'drizzle-orm';
import type {
	ActorContext,
	UpdateUserPreferencesInput,
	UserPreferences
} from '$lib/models/identity';
import type { UserPreferencesRepository } from '$lib/server/repositories/identity/user-preferences';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/identity';

export class UserPreferencesRecords implements UserPreferencesRepository {
	constructor(private readonly database: Database) {}

	async get(actor: ActorContext): Promise<UserPreferences> {
		const [row] = await this.database
			.select()
			.from(schema.userPreferences)
			.where(eq(schema.userPreferences.userId, actor.userId));
		return { sectionNumberingDefault: row?.sectionNumberingDefault ?? undefined };
	}

	async update(actor: ActorContext, input: UpdateUserPreferencesInput): Promise<UserPreferences> {
		const [row] = await this.database
			.insert(schema.userPreferences)
			.values({
				userId: actor.userId,
				sectionNumberingDefault: input.sectionNumberingDefault
			})
			.onConflictDoUpdate({
				target: schema.userPreferences.userId,
				set: { sectionNumberingDefault: input.sectionNumberingDefault }
			})
			.returning();
		return { sectionNumberingDefault: row?.sectionNumberingDefault ?? undefined };
	}
}
