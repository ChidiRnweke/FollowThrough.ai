import { describe, expect, it } from 'vitest';
import type { SearchDocument, SearchDocumentId, Skill } from '$lib/models';
import { KeywordRelevantSkillSelector } from '$lib/services';
import { InMemorySkills } from '$lib/testing/fakes/in-memory-agent';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/fakes/in-memory-search';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/fixtures/domain-builders';
import { BasicAgentCapabilities } from './diagram-agent-capabilities';
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
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder()];
	const skills = new InMemorySkills();
	skills.skills = [skill(skillProject)];
	const builder = new EnrichedAgentContextBuilder(
		new BasicAgentCapabilities(undefined, undefined, notes),
		new EmbeddedKnowledgeSearcher(repository, new InMemoryEmbeddingClient()),
		skills,
		new KeywordRelevantSkillSelector(),
		skills
	);
	return { builder, skills };
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

	it('injects matching skill instructions from the active project', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Create an architecture decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect((context.skills as { instructions: string }[])[0]?.instructions).toBe(
			'Always state the decision and consequences.'
		);
	});

	it('does not inject a matching skill from another project', async () => {
		const { builder } = await setup(testProjectId(2));
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Create an architecture decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect(context.skills).toEqual([]);
	});

	it('records usage for an injected skill', async () => {
		const { builder, skills } = await setup();
		await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Create an architecture decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect(skills.usages).toEqual([
			{
				skillNoteId: testNoteId(3),
				contextNoteId: testNoteId(),
				provenanceId: testProvenanceId()
			}
		]);
	});
});
