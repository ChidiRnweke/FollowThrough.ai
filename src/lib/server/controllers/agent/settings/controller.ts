import {
	CHAT_WEB_SEARCH_DEFAULTS,
	DEFAULT_AGENT_MAX_TURNS,
	type WebResearchOptions
} from '$lib/models/agent';
import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type {
	IAgentModelChoiceService,
	IAgentModelSelectionService
} from '$lib/services/agent/model-selection';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';
import type { AgentRunSettings } from '$lib/services/agent/run-settings';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import type { AgentPreferenceEditing } from '$lib/services/agent/preferences';

import { ValidationError } from '$lib/errors';
import type { AgentModel, AgentPreferences, UpdateAgentPreferencesInput } from '$lib/models/agent';
import type { AgentModelDefaults } from '$lib/models/agent/model-label';
import type { ActorContext } from '$lib/models/identity';
import type { AtomicOperation, DateTime } from '$lib/models/workspace';
import type {
	AgentPreferenceMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type {
	AgentModelCatalog,
	AgentPreferenceEditor
} from '$lib/server/services/agent/runs/preferences';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';

/**
 * Application boundary for agent preferences: reading and updating the user's defaults,
 * and listing the models they can choose from.
 */
export interface AgentSettingsController {
	synchronize(
		actor: ActorContext,
		input: AgentPreferenceMutationRequest
	): Promise<WorkspaceMutationResult>;
	/** Read the user's current agent preferences. */
	getPreferences(actor: ActorContext): Promise<AgentPreferences>;
	/**
	 * Apply an update to the user's agent preferences, validating every value in one
	 * place — the settings form and the agent's own `update_agent_preferences` tool both
	 * land here, so the limits have to hold exactly once. Model choices are checked
	 * selectable, the web search engine must be known, and numeric limits are rejected
	 * rather than clamped.
	 *
	 * @throws ValidationError if a model is not selectable, the engine is unknown, or a
	 * numeric limit falls outside its range.
	 */
	updatePreferences(
		actor: ActorContext,
		input: UpdateAgentPreferencesInput
	): Promise<AgentPreferences>;
	/** List the models the user can choose from for the agent. */
	listModels(actor: ActorContext): Promise<readonly AgentModel[]>;
	/**
	 * The chat and vision models a conversation with no override of its own runs on.
	 *
	 * The composer names this model beside the one a chat has chosen, so the client
	 * needs the resolved answer rather than the ingredients: the last fallback is
	 * deployment configuration the browser cannot see, and a guess there would label
	 * a model the run does not use.
	 */
	resolveDefaults(actor: ActorContext): Promise<AgentModelDefaults>;
	bootstrap(actor: ActorContext): Promise<WorkspaceBootstrap>;

	agentGetAgentPreferences(
		actor: ActorContext,
		input: AgentToolInput<'get_agent_preferences'>
	): Promise<AgentPayload>;
	agentUpdateAgentPreferences(
		actor: ActorContext,
		input: AgentToolInput<'update_agent_preferences'>
	): Promise<AgentPayload>;
	agentListAgentModels(
		actor: ActorContext,
		input: AgentToolInput<'list_agent_models'>
	): Promise<AgentPayload>;
}

export interface AgentSettingsDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	readonly preferenceEditing: AgentPreferenceEditing;
	readonly modelSelection: IAgentModelSelectionService;
	readonly modelChoices: IAgentModelChoiceService;
	syncMutations: WorkspaceMutationGuard;
	transactionRunner: AtomicOperation;
	syncRetry: 'database-only' | 'never';
	preferences: AgentPreferenceEditor;
	now: () => DateTime;
	models: AgentModelCatalog;
	/** Deployment fallback chat model when the user has not chosen one. */
	defaultModel: string;
	/** Deployment fallback vision model when the user has not chosen one. */
	defaultVisionModel: string;
	readonly runSettings: AgentRunSettings;
	webSearchOverrides: WebResearchOptions;
	agentAvailable: boolean;
}

export class AgentSettings implements AgentSettingsController {
	async synchronize(
		actor: ActorContext,
		input: AgentPreferenceMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
					return this.dependencies.syncMutations.complete(actor, input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(
		actor: ActorContext,
		input: AgentPreferenceMutationRequest
	): Promise<void> {
		if (input.command.userId !== actor.userId)
			throw new ValidationError('The preferences belong to another account');
		await this.updatePreferences(actor, input.command.patch);
	}
	constructor(
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: AgentSettingsDependencies
	) {}

	getPreferences(actor: ActorContext): Promise<AgentPreferences> {
		return this.dependencies.preferences.get(actor);
	}

	async updatePreferences(
		actor: ActorContext,
		input: UpdateAgentPreferencesInput
	): Promise<AgentPreferences> {
		const choices: { modelId: string; role: 'chat' | 'vision' | 'generation' }[] = [];
		if (input.defaultModel) choices.push({ modelId: input.defaultModel, role: 'chat' });
		if (input.defaultVisionModel)
			choices.push({ modelId: input.defaultVisionModel, role: 'vision' });
		if (input.attachmentVisionModel)
			choices.push({ modelId: input.attachmentVisionModel, role: 'vision' });
		if (input.inlineModel) choices.push({ modelId: input.inlineModel, role: 'generation' });
		if (choices.length > 0) {
			const models = this.dependencies.modelChoices.configuredAgentModels(
				await this.dependencies.models.list(),
				this.modelDefaults()
			);
			for (const choice of choices) {
				const issue = this.dependencies.modelChoices.modelChoiceIssue(
					models,
					choice.modelId,
					choice.role
				);
				if (issue) throw new ValidationError(issue);
			}
		}
		this.dependencies.preferenceEditing.validate(input);
		return this.dependencies.transactionRunner.run(async () => {
			const resourceKey = this.workspaceCommandRules.workspaceResourceKey({
				type: 'agent_preferences',
				id: [actor.userId]
			});
			const stored = await this.dependencies.preferences.getForWrite(actor, resourceKey);
			const timestamp = this.dependencies.now();
			const current = stored ?? this.dependencies.preferences.defaults(actor, timestamp);
			const preferences = this.dependencies.preferenceEditing.apply(current, input, timestamp);
			return this.dependencies.preferences.persist(actor, preferences);
		});
	}

	async listModels(_actor: ActorContext): Promise<readonly AgentModel[]> {
		void _actor;
		return this.dependencies.modelChoices.configuredChatModels(
			await this.dependencies.models.list(),
			this.modelDefaults()
		);
	}

	async bootstrap(actor: ActorContext): Promise<WorkspaceBootstrap> {
		const agentDefaults = this.modelDefaults();
		const webSearch = this.dependencies.runSettings.research(
			this.dependencies.webSearchOverrides,
			CHAT_WEB_SEARCH_DEFAULTS
		);
		const agentModels = this.dependencies.modelChoices.configuredChatModels(
			await this.dependencies.models.list(),
			agentDefaults
		);
		return {
			accountId: actor.userId,
			agentDefaults,
			agentModels,
			numericDefaults: {
				webSearchMaxResults: webSearch.maxResults,
				webSearchMaxTotalResults: webSearch.maxTotalResults,
				agentMaxTurns: DEFAULT_AGENT_MAX_TURNS
			},
			agentAvailable: this.dependencies.agentAvailable
		};
	}

	private modelDefaults(): AgentModelDefaults {
		return {
			chatModelId: this.dependencies.modelSelection.resolveDefaultAgentModel(
				{},
				this.dependencies.defaultModel
			),
			visionModelId: this.dependencies.modelSelection.resolveDefaultVisionModel(
				{},
				this.dependencies.defaultVisionModel
			)
		};
	}

	async resolveDefaults(actor: ActorContext): Promise<AgentModelDefaults> {
		const preferences = await this.dependencies.preferences.get(actor);
		return {
			chatModelId: this.dependencies.modelSelection.resolveDefaultAgentModel(
				preferences,
				this.dependencies.defaultModel
			),
			visionModelId: this.dependencies.modelSelection.resolveDefaultVisionModel(
				preferences,
				this.dependencies.defaultVisionModel
			)
		};
	}

	async agentGetAgentPreferences(
		actor: ActorContext,
		input: AgentToolInput<'get_agent_preferences'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.getPreferences(actor);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentUpdateAgentPreferences(
		actor: ActorContext,
		input: AgentToolInput<'update_agent_preferences'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			const previous = await this.getPreferences(actor);
			const updated = await this.updatePreferences(actor, input);
			return { ...updated, previous };
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentListAgentModels(
		actor: ActorContext,
		input: AgentToolInput<'list_agent_models'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.listModels(actor);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
}
