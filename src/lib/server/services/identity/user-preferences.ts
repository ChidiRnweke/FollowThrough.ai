import type {
	ActorContext,
	UpdateUserPreferencesInput,
	UserPreferences
} from '$lib/models/identity';
import type { UserPreferencesRepository } from '$lib/server/repositories/identity';

export interface UserPreferencesReader {
	get(actor: ActorContext): Promise<UserPreferences>;
}

export interface UserPreferencesWriter {
	update(actor: ActorContext, input: UpdateUserPreferencesInput): Promise<UserPreferences>;
}

export class UserPreferenceStore implements UserPreferencesReader, UserPreferencesWriter {
	constructor(private readonly preferences: UserPreferencesRepository) {}

	get(actor: ActorContext): Promise<UserPreferences> {
		return this.preferences.get(actor);
	}

	update(actor: ActorContext, input: UpdateUserPreferencesInput): Promise<UserPreferences> {
		return this.preferences.update(actor, input);
	}
}
