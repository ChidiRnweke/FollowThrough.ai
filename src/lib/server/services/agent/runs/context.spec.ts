import { describe, expect, it } from 'vitest';
import type { Skill } from '$lib/models/skills';
import { InMemorySkills } from '$lib/testing/agent/fakes/in-memory-agent';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import {
	appContextBuilder,
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { BaseAgentContext } from './base-context';
import { AgentContext } from './context';

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
	const builder = new AgentContext(new BaseAgentContext(notes), skills, notes);
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

describe('Scope staged before the user moved screens', () => {
	/** The staged note lives in a project the user has since navigated away from. */
	const resolved = async () => {
		const notes = new InMemoryNoteContent();
		notes.notes = [noteBuilder({ id: testNoteId(2), title: 'Migration plan' })];
		const projects = new InMemoryProjects();
		projects.projects = [projectBuilder({ id: testProjectId(2), name: 'Project Beta' })];
		const builder = new AgentContext(
			new BaseAgentContext(),
			new InMemorySkills(),
			notes,
			undefined,
			projects
		);
		const context = await builder.build(
			testActor(),
			{
				prompt: 'Summarise this',
				appContext: appContextBuilder(),
				requestedScope: { projectId: testProjectId(2), noteId: testNoteId(2) }
			},
			{ provenanceId: testProvenanceId() }
		);
		return (context.appContext as { requestedScope?: { note: string; noteTitle?: string } })
			.requestedScope;
	};

	it('names both sides of the divergence for the agent', async () => {
		expect(await resolved()).toMatchObject({
			note: expect.stringContaining('Project Beta') as unknown as string
		});
	});

	it('resolves the staged note title rather than leaving a bare id', async () => {
		expect((await resolved())?.noteTitle).toBe('Migration plan');
	});
});
