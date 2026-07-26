import { describe, expect, it } from 'vitest';
import type { Skill } from '$lib/models';
import { InMemorySkills } from '$lib/testing/fakes/in-memory-agent';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/fixtures/domain-builders';
import { BasicAgent } from './basic-agent';
import { EnrichedAgentContextBuilder } from './agent-context-capabilities';

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

const catalog = (context: Readonly<Record<string, unknown>>) =>
	context.skills as { items: { name: string; description: string }[]; truncated?: true };

const setup = async (skillProject = testProjectId()) => {
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder()];
	const skills = new InMemorySkills();
	skills.skills = [skill(skillProject)];
	const builder = new EnrichedAgentContextBuilder(
		new BasicAgent(undefined, undefined, notes),
		skills,
		notes
	);
	return { builder, skills, notes };
};

describe('Agent grounding invariants', () => {
	it('keeps user memory out of application context', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Anything at all' },
			{ provenanceId: testProvenanceId() }
		);
		expect(context).not.toHaveProperty('userProfile');
	});

	it('exposes skill summaries without eagerly injecting instructions', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Create an architecture decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items[0]).not.toHaveProperty('instructions');
	});

	it('makes enabled skill summaries discoverable across projects', async () => {
		const { builder } = await setup(testProjectId(2));
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Create an architecture decision' },
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items.map((item) => item.name)).toEqual(['Decision records']);
	});

	it('includes an explicitly requested skill', async () => {
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
		expect(catalog(context).items.map((item) => item.name)).toEqual(['Decision records']);
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
		expect(catalog(context).items.map((item) => item.name)).toEqual(['Decision records']);
	});

	it('does not duplicate a skill that is also explicitly requested', async () => {
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
		expect(catalog(context).items).toHaveLength(1);
	});

	it('advertises a skill whose wording shares nothing with the prompt', async () => {
		const { builder } = await setup();
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Why does it keep asking me to approve things?' },
			{ provenanceId: testProvenanceId() }
		);
		expect(catalog(context).items.map((item) => item.name)).toEqual(['Decision records']);
	});

	it('withholds a skill that opted out of implicit invocation', async () => {
		const { builder, skills } = await setup();
		skills.skills = [{ ...skill(), allowImplicitInvocation: false }];
		const context = await builder.build(
			testActor(),
			{ noteId: testNoteId(), prompt: 'Create an architecture decision' },
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
			{ noteId: testNoteId(), prompt: 'Anything at all' },
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
			{ noteId: testNoteId(), prompt: 'Anything at all' },
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
