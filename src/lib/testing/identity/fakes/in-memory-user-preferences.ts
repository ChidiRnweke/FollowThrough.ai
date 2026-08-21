import type {
	ActorContext,
	UpdateUserPreferencesInput,
	UserPreferences
} from '$lib/models/identity';
import type { UserPreferencesRepository } from '$lib/server/repositories/identity';

export class InMemoryUserPreferencesRepository implements UserPreferencesRepository {
	private readonly byUser = new Map<string, UserPreferences>();

	async get(actor: ActorContext): Promise<UserPreferences> {
		return this.byUser.get(actor.userId) ?? {};
	}

	async update(actor: ActorContext, input: UpdateUserPreferencesInput): Promise<UserPreferences> {
		const updated: UserPreferences = {
			...this.byUser.get(actor.userId),
			sectionNumberingDefault: input.sectionNumberingDefault
		};
		this.byUser.set(actor.userId, updated);
		return updated;
	}
}
