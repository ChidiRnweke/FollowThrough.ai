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
	get(actor: ActorContext): Promise<UserPreferences>;
	update(actor: ActorContext, input: UpdateUserPreferencesInput): Promise<UserPreferences>;
}
