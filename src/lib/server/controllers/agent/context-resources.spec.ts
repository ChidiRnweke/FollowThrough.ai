import { describe, expect, it } from 'vitest';
import { agentContextFixture } from '$lib/testing/agent/fixtures/context';
import { widgetBuilder, testWidgetId } from '$lib/testing/widgets/fixtures/widgets';
import { attachmentViewBuilder, testAttachmentId } from '$lib/testing/attachments/fixtures/views';
import {
	diagramBuilder,
	testActor,
	testConversationId,
	testDiagramId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { ContextResourceRef } from '$lib/models/agent';

const prepare = async (contextResources: readonly ContextResourceRef[]) => {
	const fixture = agentContextFixture();
	fixture.resources.widgets = [widgetBuilder()];
	fixture.resources.diagrams = [diagramBuilder()];
	fixture.resources.attachments = [attachmentViewBuilder()];
	return fixture.builder.build(
		testActor(),
		{ conversationId: testConversationId(), prompt: 'Explain this', contextResources },
		{ provenanceId: testProvenanceId() }
	);
};

describe('Attached widgets, diagrams and files', () => {
	it('resolves each attached resource into the run context, in the order attached', async () => {
		const context = await prepare([
			{ kind: 'attachment', id: testAttachmentId() },
			{ kind: 'widget', id: testWidgetId() },
			{ kind: 'diagram', id: testDiagramId() }
		]);
		expect(context.contextResources.map((resource) => resource.kind)).toEqual([
			'attachment',
			'widget',
			'diagram'
		]);
	});

	it('points a diagram at its mounted file', async () => {
		const context = await prepare([{ kind: 'diagram', id: testDiagramId() }]);
		expect(context.contextResources[0]).toMatchObject({
			filePath: `/projects/${testProjectId()}/diagrams/${testDiagramId()}.mmd`
		});
	});

	it('fails the run visibly when an attached widget is gone', async () => {
		await expect(prepare([{ kind: 'widget', id: testWidgetId(9) }])).rejects.toThrow(
			'An attached widget is no longer available. Remove it from context and retry.'
		);
	});

	it('fails the run visibly when an attached file is gone', async () => {
		await expect(prepare([{ kind: 'attachment', id: testAttachmentId(9) }])).rejects.toThrow(
			'An attached file is no longer available. Remove it from context and retry.'
		);
	});
});
