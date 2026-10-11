import type { UpdateUserPreferencesInput, UserPreferences } from '$lib/models/identity';
import type { UserPreferencesRepository } from '$lib/server/repositories/identity';

export interface UserPreferencesReader {
	get(): Promise<UserPreferences>;
}

export interface UserPreferencesWriter {
	update(input: UpdateUserPreferencesInput): Promise<UserPreferences>;
}

export class UserPreferenceStore implements UserPreferencesReader, UserPreferencesWriter {
	constructor(private readonly preferences: UserPreferencesRepository) {}

	get(): Promise<UserPreferences> {
		return this.preferences.get();
	}

	update(input: UpdateUserPreferencesInput): Promise<UserPreferences> {
		return this.preferences.update(input);
	}
}
