import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import type { WebResearchSettings } from '$lib/models/agent';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { agentContextFixture } from '$lib/testing/agent/fixtures/context';
import { InMemoryAgentPreferencesRepository } from '$lib/testing/agent/fakes/in-memory-inline-completion';
import { InMemoryModelCatalog } from '$lib/testing/agent/fakes/in-memory-model-catalog';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

export const agentSubmissionFixture = (
	phase: 'queued' | 'running' | 'approval' | 'abortable' = 'queued',
	configuration: {
		readonly defaultModel?: string;
		readonly defaultVisionModel?: string;
		readonly webSearchDefaults?: WebResearchSettings;
	} = {}
) => {
	const { dependencies, runs } = agentContextFixture();
	const { sessions, runner } = dependencies;
	let claim = Promise.withResolvers<void>();
	const completion = Promise.withResolvers<void>();
	runs.executionClaim = claim.promise;
	runner.completion = completion.promise;
	runner.abortable = phase === 'abortable';
	if (phase !== 'queued') claim.resolve();
	if (phase === 'approval') {
		completion.resolve();
		runner.outcome = {
			type: 'approval_checkpoint',
			serializedState: 'provider-checkpoint',
			sessionItems: [],
			pendingDecisions: [{ callId: 'call-1', toolName: 'archive_note', arguments: {} }]
		};
	}
	const conversations = new InMemoryConversationRepository((runId) =>
		runs.runs.some((run) => run.id === runId)
	);
	const journal = new ConversationArchive(conversations);
	const models = new InMemoryModelCatalog();
	const preferenceRecords = new InMemoryAgentPreferencesRepository();
	const preferences = new AgentPreferenceCatalog(preferenceRecords);
	const controller = new Agent(
		capabilityDependencies<AgentDependencies>({
			...dependencies,
			conversationJournal: journal,
			contextConversations: journal,
			transactionRunner: new InMemoryTransactionRunner([conversations, runs, sessions]),
			preferences,
			webSearchDefaults: configuration.webSearchDefaults ?? dependencies.webSearchDefaults,
			models,
			defaultModel: configuration.defaultModel ?? 'openai/test-model',
			defaultVisionModel: configuration.defaultVisionModel ?? 'openai/test-vision-model'
		})
	);
	return {
		controller,
		models,
		preferences,
		preferenceRecords,
		conversations,
		runs,
		sessions,
		runner,
		pauseExecution: () => {
			claim = Promise.withResolvers<void>();
			runs.executionClaim = claim.promise;
		},
		release: () => {
			claim.resolve();
			completion.resolve();
		}
	};
};
