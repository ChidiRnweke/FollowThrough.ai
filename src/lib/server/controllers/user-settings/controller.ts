import { ValidationError } from '$lib/errors';
import type {
	UserPreferenceMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { SyncMutationTransactions } from '$lib/server/services/workspace/mutations';
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
	synchronize(
		actor: ActorContext,
		input: UserPreferenceMutationRequest
	): Promise<WorkspaceMutationResult>;
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
	syncMutations: Pick<SyncMutationTransactions, 'run'>;
	preferences: UserPreferencesReader & UserPreferencesWriter;
}

export class UserSettings implements UserSettingsController {
	synchronize(
		actor: ActorContext,
		input: UserPreferenceMutationRequest
	): Promise<WorkspaceMutationResult> {
		return this.dependencies.syncMutations.run(actor, input, async () => {
			if (input.command.userId !== actor.userId)
				throw new ValidationError('The preferences belong to another account');
			await this.updatePreferences(actor, {
				sectionNumberingDefault: input.command.sectionNumberingDefault
			});
		});
	}
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
