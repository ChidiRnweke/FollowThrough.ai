import { describe, expect, it } from 'vitest';
import { agentContextFixture } from '$lib/testing/agent/fixtures/context';
import { widgetBuilder, testWidgetId } from '$lib/testing/widgets/fixtures/widgets';
import { attachmentViewBuilder, testAttachmentId } from '$lib/testing/attachments/fixtures/views';
import {
	diagramBuilder,
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testNow,
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

describe('An attached connection map', () => {
	const brief = noteBuilder({ id: testNoteId(1), title: 'Brief' });
	const plan = noteBuilder({ id: testNoteId(2), title: 'Plan' });
	const read = (note: typeof brief, call: number) => ({
		kind: 'note' as const,
		id: note.id,
		projectId: testProjectId(),
		conversationId: testConversationId(7),
		at: testNow,
		call
	});

	const prepareConnections = async (projectId = testProjectId()) => {
		const fixture = agentContextFixture();
		fixture.projects.projects = [
			projectBuilder({ name: 'Launch' }),
			projectBuilder({ id: testProjectId(8), userId: testActor(2).userId, name: 'Theirs' })
		];
		fixture.projects.entries = [brief, plan];
		fixture.contextLog.log = {
			touches: [read(brief, 1), read(plan, 2)],
			emptySearches: [],
			conversations: [{ id: testConversationId(7), projectId: testProjectId() }],
			unreadableCalls: 0
		};
		return fixture.builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				prompt: 'Which notes are always read together?',
				contextResources: [{ kind: 'connections', id: projectId }]
			},
			{ provenanceId: testProvenanceId() }
		);
	};

	it('puts the project and both tables in the run context', async () => {
		const [resource] = (await prepareConnections()).contextResources;
		const text = resource?.kind === 'connections' && resource.text.inclusion === 'inline';
		const body = text ? resource.text.text : '';
		expect({
			project: resource?.kind === 'connections' ? resource.projectName : undefined,
			nodes: body.includes('nodes.csv\nkey,kind,title,times_read,last_read,chats\r\n'),
			brief: body.includes(`note:${brief.id},note,Brief,1,${testNow},1\r\n`),
			edges: body.includes(
				'edges.csv\nitem_a,item_b,chats_read_together,a_before_b_chats,b_before_a_chats,linked_kinds\r\n'
			),
			pair: body.includes('Brief,Plan,1,1,0,\r\n')
		}).toEqual({ project: 'Launch', nodes: true, brief: true, edges: true, pair: true });
	});

	it("fails the run visibly when the project is not the actor's", async () => {
		await expect(prepareConnections(testProjectId(8))).rejects.toThrow(
			'An attached connection map is no longer available. Remove it from context and retry.'
		);
	});

	it('fails the run visibly when the project is gone', async () => {
		await expect(prepareConnections(testProjectId(9))).rejects.toThrow(
			'An attached connection map is no longer available. Remove it from context and retry.'
		);
	});
});
