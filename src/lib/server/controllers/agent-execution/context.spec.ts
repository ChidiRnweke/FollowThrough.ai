import { agentContextFixture } from '$lib/testing/agent/fixtures/context';
import { describe, expect, it } from 'vitest';
import type { Skill } from '$lib/models/skills';
import {
	appContextBuilder,
	memoryEntryBuilder,
	noteBuilder,
	projectBuilder,
	testActor,
	testConversationId,
	testNoteId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { Note } from '$lib/models/notes';
import type { AgentRunContext } from '$lib/models/agent';

const skill = (project = testProjectId()): Skill<Note> => ({
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

const catalog = (context: AgentRunContext) => context.skills;

const setup = async (skillProject = testProjectId()) => {
	const fixture = agentContextFixture();
	fixture.skills.skills = [skill(skillProject)];
	return fixture;
};

describe('Agent grounding invariants', () => {
	it('includes shared profile memory in a prepared run', async () => {
		const { builder, memory } = await setup();
		memory.entries = [
			memoryEntryBuilder({ projectId: undefined, content: 'Prefer concise answers.' })
		];
		const context = await builder.build(
			testActor(),
			{ conversationId: testConversationId(), prompt: 'Help' },
			{ provenanceId: testProvenanceId() }
		);
		expect(context.userMemory).toEqual(['Prefer concise answers.']);
	});

	it('excludes private profile memory from the prepared run', async () => {
		const { builder, memory } = await setup();
		memory.entries = [memoryEntryBuilder({ projectId: undefined, shareWithAgents: false })];
		const context = await builder.build(
			testActor(),
			{ conversationId: testConversationId(), prompt: 'Help' },
			{ provenanceId: testProvenanceId() }
		);
		expect(context.userMemory).toBeUndefined();
	});

	it('leaves project memory for explicit retrieval', async () => {
		const { builder, memory } = await setup();
		memory.entries = [memoryEntryBuilder()];
		const context = await builder.build(
			testActor(),
			{ conversationId: testConversationId(), noteId: testNoteId(), prompt: 'Help' },
			{ provenanceId: testProvenanceId() }
		);
		expect(context.userMemory).toBeUndefined();
	});

	it('persists a failed run when a required attached note is missing', async () => {
		const { builder, runs } = await setup();
		await builder
			.build(
				testActor(),
				{
					conversationId: testConversationId(),
					prompt: 'Compare these',
					contextNoteIds: [testNoteId(9)]
				},
				{ provenanceId: testProvenanceId() }
			)
			.catch(() => undefined);
		expect(runs.runs.map((run) => run.status)).toEqual(['failed']);
	});

	it('retains every explicitly requested note from a large folder', async () => {
		const { builder, notes } = await setup();
		const attached = Array.from({ length: 80 }, (_, index) =>
			noteBuilder({
				id: testNoteId(100 + index),
				title: `Research ${index}`,
				plainText: `Finding ${index}`
			})
		);
		notes.notes = [...notes.notes, ...attached];
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Summarize the folder',
				contextNoteIds: attached.map((note) => note.id)
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(context.contextNotes.map((note) => note.noteId)).toEqual(
			attached.map((note) => note.id)
		);
	});
	it('keeps user memory out of application context', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{ conversationId: testConversationId(), noteId: testNoteId(), prompt: 'Anything at all' },
			{ provenanceId: testProvenanceId() }
		);
		expect(context).not.toHaveProperty('userProfile');
	});

	it('exposes skill summaries without eagerly injecting instructions', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Create an architecture decision'
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items[0]).not.toHaveProperty('instructions');
	});

	it('makes enabled skill summaries discoverable across projects', async () => {
		const { builder } = await setup(testProjectId(2));
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Create an architecture decision'
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items.map((item) => item.name)).toEqual(['Decision records']);
	});

	it('includes an explicitly requested skill', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Summarize this text',
				requestedSkillNames: ['Decision records']
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items.map((item) => item.name)).toEqual(['Decision records']);
	});

	it('includes an explicitly requested skill from another project', async () => {
		const { builder } = await setup(testProjectId(2));
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Summarize this text',
				requestedSkillNames: ['Decision records']
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items.map((item) => item.name)).toEqual(['Decision records']);
	});

	it('does not duplicate a skill that is also explicitly requested', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Create an architecture decision',
				requestedSkillNames: ['Decision records']
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items).toHaveLength(1);
	});

	it('advertises a skill whose wording shares nothing with the prompt', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Why does it keep asking me to approve things?'
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items.map((item) => item.name)).toEqual(['Decision records']);
	});

	it('withholds a skill that opted out of implicit invocation', async () => {
		const { builder, skills } = await setup();
		skills.skills = [{ ...skill(), allowImplicitInvocation: false }];
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Create an architecture decision'
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items).toEqual([]);
	});

	it('advertises an opted-out skill when it is explicitly requested', async () => {
		const { builder, skills } = await setup();
		skills.skills = [{ ...skill(), allowImplicitInvocation: false }];
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Summarize this text',
				requestedSkillNames: ['Decision records']
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items.map((item) => item.name)).toEqual(['Decision records']);
	});

	it('keeps pinned skills when the catalogue overflows its budget', async () => {
		const { builder, skills } = await setup();
		const pinned = {
			...skill(),
			note: noteBuilder({ id: testNoteId(4), kind: 'skill' }),
			name: 'Zzz pinned'
		};
		skills.skills = [
			pinned,
			...Array.from({ length: 200 }, (_, index) => ({
				...skill(),
				note: noteBuilder({ id: testNoteId(100 + index), kind: 'skill' }),
				name: `Filler ${index}`,
				description: 'x'.repeat(400)
			}))
		];
		skills.pinnedNoteIds = [pinned.note.id];
		const context = await builder.build(
			testActor(),
			{ conversationId: testConversationId(), noteId: testNoteId(), prompt: 'Anything at all' },
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items[0]?.name).toBe('Zzz pinned');
	});

	it('flags an overflowing catalogue as truncated', async () => {
		const { builder, skills } = await setup();
		skills.skills = Array.from({ length: 200 }, (_, index) => ({
			...skill(),
			note: noteBuilder({ id: testNoteId(100 + index), kind: 'skill' }),
			name: `Filler ${index}`,
			description: 'x'.repeat(400)
		}));
		const context = await builder.build(
			testActor(),
			{ conversationId: testConversationId(), noteId: testNoteId(), prompt: 'Anything at all' },
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).truncated).toBe(true);
	});

	it('includes explicitly attached context notes with their content', async () => {
		const { builder, notes } = await setup();
		notes.notes = [
			...notes.notes,
			noteBuilder({ id: testNoteId(5), title: 'Kickoff', plainText: 'Decisions from kickoff.' })
		];
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Draft an ADR',
				contextNoteIds: [testNoteId(5)]
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(context.contextNotes).toEqual([
			{
				noteId: testNoteId(5),
				title: 'Kickoff',
				content: 'Decisions from kickoff.',
				tokenCount: expect.any(Number)
			}
		]);
	});

	const oversizedContext = async () => {
		const { builder, notes } = await setup();
		const longText = 'The platform uses asynchronous messaging between services. '.repeat(600);
		notes.notes = [
			...notes.notes,
			noteBuilder({ id: testNoteId(6), title: 'Long note', plainText: longText })
		];
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Summarize it',
				contextNoteIds: [testNoteId(6)]
			},
			{ provenanceId: testProvenanceId() }
		);
		return context.contextNotes[0];
	};

	it('omits the content of oversized context notes', async () => {
		expect((await oversizedContext())?.content).toBeUndefined();
	});

	it('reports the token count of oversized context notes', async () => {
		expect((await oversizedContext())?.tokenCount).toBeGreaterThan(4000);
	});

	it('asks for missing attached context to be removed instead of answering with fewer notes', async () => {
		const { builder } = await setup();
		await expect(
			builder.build(
				testActor(),
				{
					conversationId: testConversationId(),
					noteId: testNoteId(),
					prompt: 'Compare the attached notes',
					contextNoteIds: [testNoteId(), testNoteId(9)]
				},
				{ provenanceId: testProvenanceId() }
			)
		).rejects.toThrow('An attached note is no longer available. Remove it from context and retry.');
	});

	// Preserve operational failures; an unavailable store does not prove deletion.
	it('fails the turn when a context note cannot be read at all', async () => {
		const { builder, notes } = await setup();
		notes.readFailure = new Error('The note store is unreachable.');
		await expect(
			builder.build(
				testActor(),
				{
					conversationId: testConversationId(),
					noteId: testNoteId(),
					prompt: 'Draft an ADR',
					contextNoteIds: [testNoteId(9)]
				},
				{ provenanceId: testProvenanceId() }
			)
		).rejects.toThrow('The note store is unreachable.');
	});

	it('does not record skill usage before the agent loads it', async () => {
		const { builder, skills } = await setup();
		await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				noteId: testNoteId(),
				prompt: 'Create an architecture decision'
			},
			{ provenanceId: testProvenanceId() }
		);
		expect(skills.usages).toEqual([]);
	});
});

describe('Scope staged before the user moved screens', () => {
	/** The staged note lives in a project the user has since navigated away from. */
	const resolved = async () => {
		const { builder, notes, projects } = await setup();
		notes.notes = [noteBuilder({ id: testNoteId(2), title: 'Migration plan' })];
		projects.projects = [projectBuilder({ id: testProjectId(2), name: 'Project Beta' })];
		const context = await builder.build(
			testActor(),
			{
				conversationId: testConversationId(),
				prompt: 'Summarise this',
				appContext: appContextBuilder(),
				requestedScope: { projectId: testProjectId(2), noteId: testNoteId(2) }
			},
			{ provenanceId: testProvenanceId() }
		);
		return context.appContext?.requestedScope;
	};

	it('names both sides of the divergence for the agent', async () => {
		expect((await resolved())?.note).toContain('Project Beta');
	});

	it('resolves the staged note title rather than leaving a bare id', async () => {
		expect((await resolved())?.noteTitle).toBe('Migration plan');
	});
});
