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
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database
	) {}

	async get(): Promise<UserPreferences> {
		const [row] = await this.database
			.select()
			.from(schema.userPreferences)
			.where(eq(schema.userPreferences.userId, this.actor.userId));
		return { sectionNumberingDefault: row?.sectionNumberingDefault ?? undefined };
	}

	async update(input: UpdateUserPreferencesInput): Promise<UserPreferences> {
		const [row] = await this.database
			.insert(schema.userPreferences)
			.values({
				userId: this.actor.userId,
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
