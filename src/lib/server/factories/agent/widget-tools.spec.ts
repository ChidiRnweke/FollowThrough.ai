import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { describe, expect, it } from 'vitest';
import { AgentTools } from './agent-tool-factory';
import { jsonObjectSchema } from './tool-call-boundary';
import { Widgets, type WidgetsDependencies } from '$lib/server/controllers/widgets/controller';
import { WidgetLibrary } from '$lib/server/services/widgets/library';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryWidgetRepository } from '$lib/testing/widgets/fakes/in-memory-widget-repository';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { widgetBuilder, testWidgetId } from '$lib/testing/widgets/fixtures/widgets';
import {
	projectBuilder,
	testActor,
	testConversationId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { widgetTemplates } from '$lib/models/widgets';
import { agentPayloadObjectResultSchema } from '$lib/models/agent/payload';
import { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';
import { widgetReferencesIn } from '$lib/services/notes/references';

const setup = () => {
	const repository = new InMemoryWidgetRepository();
	repository.widgets = [widgetBuilder()];
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const library = new WidgetLibrary(repository, projects, new InMemoryNoteRepository());
	const embeddings = new InMemoryEmbeddingClient();
	const index = new ContentIndex(new InMemorySearchRepository(), embeddings.model);
	const controller = new Widgets(
		capabilityDependencies<WidgetsDependencies>({
			widgetReader: library,
			widgetLister: library,
			widgetWriter: library,
			widgetIndexer: index.widgets,
			indexEmbeddings: embeddings,
			indexWriter: index,
			transactionRunner: new InMemoryTransactionRunner([repository])
		})
	);
	const tools = new AgentTools(
		capabilityDependencies<ControllerFactory>({ widgets: () => controller }),
		testActor(),
		'auto_accept',
		{
			provenanceId: testProvenanceId(),
			input: { conversationId: testConversationId(), prompt: 'Tick the first step' },
			model: 'openai/gpt-5.6'
		},
		{ execute: (_input, action) => action() },
		new InMemoryToolRetriever(),
		{ isEnabled: () => true }
	);
	const tool = (name: string) => {
		const definition = tools.definitions().find((candidate) => candidate.name === name);
		if (!definition) throw new Error(`${name} is missing`);
		return definition;
	};
	return { repository, tool };
};

const tickFirst = JSON.stringify([{ op: 'replace', path: '/items/0/done', value: true }]);

describe('agent widget tools', () => {
	it('save a data edit through the shared edit rule', async () => {
		const { repository, tool } = setup();
		await tool('edit_widget_data')
			.prepare({ widgetId: testWidgetId(), expectedDataRevision: 1, patch: tickFirst })
			.execute();
		expect(repository.widgets[0]?.data.items).toEqual([
			{ id: 'first', label: 'First step', done: true },
			{ id: 'second', label: 'Second step', done: false },
			{ id: 'third', label: 'Third step', done: false }
		]);
	});
	it('refuse a layout the catalog rejects, naming the problem for the model', async () => {
		const { tool } = setup();
		await expect(
			tool('edit_widget_layout')
				.prepare({
					widgetId: testWidgetId(),
					expectedLayoutRevision: 1,
					patch: JSON.stringify([{ op: 'replace', path: '/elements/item/type', value: 'Iframe' }])
				})
				.execute()
		).rejects.toThrow('Iframe is not in the widget catalog');
	});
	it('refuse a stale data revision, telling the model to read again', async () => {
		const { tool } = setup();
		await expect(
			tool('edit_widget_data')
				.prepare({ widgetId: testWidgetId(), expectedDataRevision: 4, patch: tickFirst })
				.execute()
		).rejects.toThrow('Read it again and retry');
	});
	it('refuse a patch that is not JSON', async () => {
		const { tool } = setup();
		await expect(
			tool('edit_widget_data')
				.prepare({ widgetId: testWidgetId(), expectedDataRevision: 1, patch: '[{op:' })
				.execute()
		).rejects.toThrow('patch is not valid JSON');
	});
	it('publish strict JSON Schema parameters, which a string patch makes possible', () => {
		const { tool } = setup();
		expect(() => jsonObjectSchema(tool('edit_widget_layout').parameters)).not.toThrow();
	});
	const createLaunch = async () => {
		const { repository, tool } = setup();
		const output = await tool('create_widget')
			.prepare({
				title: 'Launch',
				projectId: testProjectId(),
				layout: JSON.stringify(widgetTemplates.checklist.layout),
				data: JSON.stringify(widgetTemplates.checklist.data)
			})
			.execute();
		const read = agentPayloadObjectResultSchema.parse(output);
		const embed = read.kind === 'valid' ? read.value.embed : null;
		return {
			embed: typeof embed === 'string' ? embed : '',
			created: repository.widgets.find((widget) => widget.title === 'Launch')
		};
	};
	it('create a widget from JSON strings and return a line that embeds it in a note', async () => {
		const { embed, created } = await createLaunch();
		const note = noteContentFromMarkdown(`Plan\n\n${embed}\n`);
		expect(widgetReferencesIn([note])).toEqual([created?.id]);
	});
	// The agent inserts the line inside edit_note's JSON arguments; a double quote it forgets to
	// escape there fails the whole run as malformed tool arguments.
	it('return an embed line with no double quote to escape', async () => {
		const { embed } = await createLaunch();
		expect(embed).toMatch(/^:::widgetNode \{widgetId='[^"]+'\} :::$/);
	});
	it('refuse to create a widget whose layout names an uncataloged component', async () => {
		const { tool } = setup();
		await expect(
			tool('create_widget')
				.prepare({
					title: 'Frame',
					projectId: testProjectId(),
					layout: JSON.stringify({
						root: 'x',
						elements: { x: { type: 'Iframe', props: {}, children: [] } }
					}),
					data: '{}'
				})
				.execute()
		).rejects.toThrow('Iframe is not in the widget catalog');
	});
	it('give the agent the catalog it must write to', async () => {
		const { tool } = setup();
		const output = await tool('read_widget_catalog').prepare({}).execute();
		expect(JSON.stringify(output)).toContain('### Checkbox');
	});
	it('publish strict JSON Schema parameters for creation', () => {
		const { tool } = setup();
		expect(() => jsonObjectSchema(tool('create_widget').parameters)).not.toThrow();
	});
});
