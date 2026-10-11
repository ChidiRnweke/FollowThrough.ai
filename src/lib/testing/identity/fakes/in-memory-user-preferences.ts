import type {
	ActorContext,
	UpdateUserPreferencesInput,
	UserPreferences
} from '$lib/models/identity';
import type { UserPreferencesRepository } from '$lib/server/repositories/identity';

export class InMemoryUserPreferencesRepository implements UserPreferencesRepository {
	constructor(private readonly actor: ActorContext) {}
	private readonly byUser = new Map<string, UserPreferences>();

	async get(): Promise<UserPreferences> {
		return this.byUser.get(this.actor.userId) ?? {};
	}

	async update(input: UpdateUserPreferencesInput): Promise<UserPreferences> {
		const updated: UserPreferences = {
			...this.byUser.get(this.actor.userId),
			sectionNumberingDefault: input.sectionNumberingDefault
		};
		this.byUser.set(this.actor.userId, updated);
		return updated;
	}
}
