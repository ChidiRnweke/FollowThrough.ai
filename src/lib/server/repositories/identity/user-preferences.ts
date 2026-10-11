import type {
	ActorContext,
	UpdateUserPreferencesInput,
	UserPreferences
} from '$lib/models/identity';

/**
 * One row per user, created on first write. A missing row reads as every
 * setting unset, so the default surface needs no rows at all.
 */
export interface UserPreferencesRepository {
	get(): Promise<UserPreferences>;
	update(input: UpdateUserPreferencesInput): Promise<UserPreferences>;
}
