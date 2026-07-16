import { describe, expect, it } from 'vitest';
import type { SearchDocument, SearchDocumentId, Skill } from '$lib/models';
import { InMemorySkills } from '$lib/testing/fakes/in-memory-agent';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/fakes/in-memory-search';
import {
	noteBuilder,
	testActor,
	testMemoryEntryId,
	testNoteId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/fixtures/domain-builders';
import { BasicAgent } from './basic-agent';
import { EnrichedAgentContextBuilder } from './agent-context-capabilities';
import { EmbeddedKnowledgeSearcher } from '$lib/services';

const document = (overrides: Partial<SearchDocument> = {}): SearchDocument => ({
	id: crypto.randomUUID() as SearchDocumentId,
	projectId: testProjectId(),
	noteId: testNoteId(2),
	content: 'Use an asynchronous event bus.',
	contentHash: 'hash',
	sourceRevision: 1,
	chunkIndex: 0,
	embedding: [1, 0, 0],
	...overrides
});

const skill = (project = testProjectId()): Skill => ({
	note: noteBuilder({
		id: testNoteId(3),
		projectId: project,
		kind: 'skill',
		plainText: 'Always state the decision and consequences.'
	}),
	name: 'Decision records',
	description: 'Create architecture decision records',
	triggerHints: ['decision', 'ADR'],
	isEnabled: true
});

const setup = async (skillProject = testProjectId()) => {
	const repository = new InMemorySearchRepository();
	await repository.replaceForNote(testActor(), testNoteId(2), [document()]);
	await repository.replaceForNote(testActor(), testNoteId(4), [
		document({ noteId: testNoteId(4), projectId: testProjectId(2) })
	]);
	await repository.replaceForMemoryEntry(testActor(), testMemoryEntryId(), [
		document({
			noteId: undefined,
			memoryEntryId: testMemoryEntryId(),
			content: 'The event bus decision was made in April.'
		})
	]);
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder()];
	const skills = new InMemorySkills();
	skills.skills = [skill(skillProject)];
	const builder = new EnrichedAgentContextBuilder(
		new BasicAgent(undefined, undefined, notes),
		new EmbeddedKnowledgeSearcher(repository, new InMemoryEmbeddingClient()),
		skills,
		notes
	);
	return { builder, skills, notes };
};

describe('Agent grounding invariants', () => {
	it('retrieves knowledge only from the active project', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Explain the asynchronous decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect((context.knowledge as { noteId: string }[]).map((item) => item.noteId)).toEqual([
			testNoteId(2)
		]);
	});

	it('separates memory matches from note knowledge', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Explain the asynchronous decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect(
			(context.memory as { memoryEntryId: string }[]).map((item) => item.memoryEntryId)
		).toEqual([testMemoryEntryId()]);
	});

	it('keeps memory matches out of the knowledge section', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Explain the asynchronous decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect(
			(context.knowledge as { memoryEntryId?: string }[]).every(
				(item) => item.memoryEntryId === undefined
			)
		).toBe(true);
	});

	it('exposes skill summaries without eagerly injecting instructions', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Create an architecture decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect((context.skills as { instructions?: string }[])[0]?.instructions).toBeUndefined();
	});

	it('makes enabled skill summaries discoverable across projects', async () => {
		const { builder } = await setup(testProjectId(2));
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Create an architecture decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect((context.skills as { name: string }[]).map((item) => item.name)).toEqual([
			'Decision records'
		]);
	});

	it('includes an explicitly requested skill without a keyword match', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{
				noteId: testNoteId(),
				prompt: 'Summarize this text',
				requestedSkillNames: ['Decision records']
			},
			{ provenanceId: testProvenanceId() }
		);
		expect((context.skills as { name: string }[]).map((item) => item.name)).toEqual([
			'Decision records'
		]);
	});

	it('includes an explicitly requested skill from another project', async () => {
		const { builder } = await setup(testProjectId(2));
		const context = await builder.build(
			testActor(),
			{
				noteId: testNoteId(),
				prompt: 'Summarize this text',
				requestedSkillNames: ['Decision records']
			},
			{ provenanceId: testProvenanceId() }
		);
		expect((context.skills as { name: string }[]).map((item) => item.name)).toEqual([
			'Decision records'
		]);
	});

	it('does not duplicate a requested skill that also matches by keyword', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{
				noteId: testNoteId(),
				prompt: 'Create an architecture decision',
				requestedSkillNames: ['Decision records']
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(context.skills).toHaveLength(1);
	});

	it('includes explicitly attached context notes with their content', async () => {
		const { builder, notes } = await setup();
		notes.notes = [
			...notes.notes,
			noteBuilder({ id: testNoteId(5), title: 'Kickoff', plainText: 'Decisions from kickoff.' })
		];
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Draft an ADR', contextNoteIds: [testNoteId(5)] },
			{ provenanceId: testProvenanceId() }
		);
		expect(context.contextNotes).toEqual([
			{ noteId: testNoteId(5), title: 'Kickoff', content: 'Decisions from kickoff.' }
		]);
	});

	it('skips context notes that cannot be loaded', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Draft an ADR', contextNoteIds: [testNoteId(9)] },
			{ provenanceId: testProvenanceId() }
		);
		expect(context.contextNotes).toEqual([]);
	});

	it('does not record skill usage before the agent loads it', async () => {
		const { builder, skills } = await setup();
		await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Create an architecture decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect(skills.usages).toEqual([]);
	});
});
