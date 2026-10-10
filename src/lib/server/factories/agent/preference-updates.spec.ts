import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { CHAT_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import {
	AgentSettings,
	type AgentSettingsDependencies
} from '$lib/server/controllers/agent/settings/controller';
import { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { AgentPreferenceEditingService } from '$lib/services/agent/preferences';
import { InMemoryAgentPreferencesRepository } from '$lib/testing/agent/fakes/in-memory-inline-completion';
import { InMemoryModelCatalog } from '$lib/testing/agent/fakes/in-memory-model-catalog';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
/** What the deployment falls back to when the user has chosen nothing. */
const DEPLOYMENT_CHAT_MODEL = 'deepseek/deepseek-v4-flash';
const DEPLOYMENT_VISION_MODEL = 'mistral/pixtral-large';
const timestamp = '2026-09-23T12:00:00.000Z' as DateTime;
const setup = () => {
	const repository = new InMemoryAgentPreferencesRepository();
	repository.entries.set(testActor().userId, {
		userId: testActor().userId,
		executionMode: 'approval_required',
		inlineSuggestionsEnabled: true,
		createdAt: testNow,
		updatedAt: testNow
	});
	const preferences = new AgentPreferenceCatalog(repository);
	const models = new InMemoryModelCatalog();
	models.models = [
		{
			id: 'vendor/tool-model',
			name: 'Tool model',
			provider: 'vendor',
			supportsTools: true,
			supportsVision: false,
			recommended: true,
			capabilities: ['tools']
		}
	];
	return {
		preferences,
		repository,
		models,
		controller: new AgentSettings(
			new WorkspaceCommandRulesService(),
			capabilityDependencies<AgentSettingsDependencies>({
				preferenceEditing: new AgentPreferenceEditingService(),
				...agentRulesFixture(),
				preferences,
				webSearchOverrides: CHAT_WEB_SEARCH_DEFAULTS,
				agentAvailable: true,
				transactionRunner: new InMemoryTransactionRunner([repository]),
				now: () => timestamp,
				models,
				defaultModel: DEPLOYMENT_CHAT_MODEL,
				defaultVisionModel: DEPLOYMENT_VISION_MODEL
			})
		)
	};
};

import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import {
	testConversationId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { ControllerFactory } from '../controller-factory';
import { createAgentToolSurface } from './agent-tool-factory';
const settingsTool = (controller: AgentSettings) => {
	const tool = createAgentToolSurface(
		testTokenizer,
		capabilityDependencies<ControllerFactory>({ agentSettings: () => controller }),
		testActor(),
		'auto_accept',
		{
			provenanceId: testProvenanceId(),
			model: 'test/model',
			input: { conversationId: testConversationId(), prompt: 'Update settings' }
		},
		{ execute: (_call, action) => action() },
		new InMemoryToolRetriever(),
		{ isEnabled: () => true }
	)
		.definitions()
		.find((tool) => tool.name === 'update_agent_preferences');
	if (!tool) throw new Error('Missing update_agent_preferences');
	return tool;
};
it('returns the previous preferences alongside the saved settings', async () => {
	const { controller, repository } = setup();
	const result = await settingsTool(controller).prepare({ executionMode: 'auto_accept' }).execute();
	expect({ result, saved: repository.entries.get(testActor().userId) }).toEqual({
		result: {
			userId: testActor().userId,
			executionMode: 'auto_accept',
			inlineSuggestionsEnabled: true,
			createdAt: testNow,
			updatedAt: timestamp,
			previous: {
				userId: testActor().userId,
				executionMode: 'approval_required',
				inlineSuggestionsEnabled: true,
				createdAt: testNow,
				updatedAt: testNow
			}
		},
		saved: {
			userId: testActor().userId,
			executionMode: 'auto_accept',
			inlineSuggestionsEnabled: true,
			createdAt: testNow,
			updatedAt: timestamp
		}
	});
});
it('propagates a rejected update and preserves the stored preferences', async () => {
	const { controller, repository } = setup();
	const result = await settingsTool(controller)
		.prepare({ defaultModel: 'vendor/missing' })
		.execute()
		.then(
			(value) => ({ kind: 'unexpected-success', value }),
			(error) => ({ kind: 'failure', error })
		);
	expect({ result, saved: repository.entries.get(testActor().userId) }).toEqual({
		result: { kind: 'failure', error: expect.objectContaining({ code: 'VALIDATION' }) },
		saved: {
			userId: testActor().userId,
			executionMode: 'approval_required',
			inlineSuggestionsEnabled: true,
			createdAt: testNow,
			updatedAt: testNow
		}
	});
});
