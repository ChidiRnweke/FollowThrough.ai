import { defaultExportSettings } from '$lib/models/deliverables';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { exportControllerFixture } from '$lib/testing/deliverables/fixtures/export-controller';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	testActor,
	testConversationId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { createAgentToolSurface } from './agent-tool-factory';

describe('agent export settings', () => {
	it('persists the full palette and title choice supplied by the tool', async () => {
		const { service } = exportControllerFixture();
		const factory = capabilityDependencies<ControllerFactory>({ deliverables: () => service });
		const tools = createAgentToolSurface(
			testTokenizer,
			factory,
			testActor(),
			'auto_accept',
			{
				provenanceId: testProvenanceId(),
				input: { conversationId: testConversationId(), prompt: 'Set export colors' },
				model: 'openai/gpt-5.6'
			},
			{ execute: (_input, action) => action() },
			new InMemoryToolRetriever(),
			{ isEnabled: () => true }
		);
		const tool = tools
			.definitions()
			.find((definition) => definition.name === 'update_export_settings');
		if (!tool) throw new Error('Export settings tool is missing');
		const settings = {
			...defaultExportSettings,
			includeTitle: true,
			diagramTheme: { base: 'dark', colors: { primaryColor: '#123456' } }
		};
		await tool.prepare({ projectId: testProjectId(), ...settings }).execute();
		expect(await service.getExportSettings(testActor(), testProjectId())).toEqual(settings);
	});
});
