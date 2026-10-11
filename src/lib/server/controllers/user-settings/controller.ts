import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import type { AtomicOperation } from '$lib/models/workspace';
import { ValidationError } from '$lib/errors';
import type {
	UserPreferenceMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';
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
	synchronize(input: UserPreferenceMutationRequest): Promise<WorkspaceMutationResult>;
	/** Read the user's preferences; unset fields defer to the deployment default. */
	getPreferences(): Promise<UserPreferences>;
	/**
	 * Merge a partial update, returning the full preferences so the caller sees the
	 * effect of its own write without a second round trip.
	 */
	updatePreferences(input: UpdateUserPreferencesInput): Promise<UserPreferences>;
}

export interface UserSettingsDependencies {
	syncMutations: WorkspaceMutationGuard;
	transactionRunner: AtomicOperation;
	syncRetry: 'database-only' | 'never';
	preferences: UserPreferencesReader & UserPreferencesWriter;
}

export class UserSettings implements UserSettingsController {
	async synchronize(input: UserPreferenceMutationRequest): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(input);
					return this.dependencies.syncMutations.complete(input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(input: UserPreferenceMutationRequest): Promise<void> {
		if (input.command.userId !== this.actor.userId)
			throw new ValidationError('The preferences belong to another account');
		await this.updatePreferences({
			sectionNumberingDefault: input.command.sectionNumberingDefault
		});
	}
	constructor(
		private readonly actor: ActorContext,
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: UserSettingsDependencies
	) {}

	getPreferences(): Promise<UserPreferences> {
		return this.dependencies.preferences.get();
	}

	updatePreferences(input: UpdateUserPreferencesInput): Promise<UserPreferences> {
		return this.dependencies.preferences.update(input);
	}
}
