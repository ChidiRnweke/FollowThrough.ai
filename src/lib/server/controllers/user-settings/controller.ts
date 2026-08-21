import type {
	ActorContext,
	UpdateUserPreferencesInput,
	UserPreferences
} from '$lib/models/identity';
import type {
	UserPreferencesReader,
	UserPreferencesWriter
} from '$lib/server/services/identity/user-preferences';

/**
 * The user's non-agent defaults — document and editor preferences rather than
 * anything the agent does. Deliberately not agent-callable: a viewing default
 * is a setting the user picks, not something a session should talk itself into.
 */
export interface UserSettingsController {
	/** Read the user's preferences; unset fields defer to the deployment default. */
	getPreferences(actor: ActorContext): Promise<UserPreferences>;
	/**
	 * Merge a partial update, returning the full preferences so the caller sees the
	 * effect of its own write without a second round trip.
	 */
	updatePreferences(
		actor: ActorContext,
		input: UpdateUserPreferencesInput
	): Promise<UserPreferences>;
}

export interface UserSettingsDependencies {
	preferences: UserPreferencesReader & UserPreferencesWriter;
}

export class UserSettings implements UserSettingsController {
	constructor(private readonly dependencies: UserSettingsDependencies) {}

	getPreferences(actor: ActorContext): Promise<UserPreferences> {
		return this.dependencies.preferences.get(actor);
	}

	updatePreferences(
		actor: ActorContext,
		input: UpdateUserPreferencesInput
	): Promise<UserPreferences> {
		return this.dependencies.preferences.update(actor, input);
	}
}
