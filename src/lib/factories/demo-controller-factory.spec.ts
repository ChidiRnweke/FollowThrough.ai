import { describe, expect, it } from 'vitest';
import type { ActorContext, LocalDate, TextSelection } from '../models';
import { DemoControllerFactory, demoIds, demoSkillView } from './index';

const actor: ActorContext = { userId: demoIds.user };
const today = '2026-07-11' as LocalDate;
const pinnedSummary = { title: 'Northwind integration platform', isPinned: true };
const selection: TextSelection = {
	noteId: demoIds.note,
	revision: 1,
	from: 0,
	to: 10,
	text: 'I will send it.'
};

describe('DemoControllerFactory', () => {
	it('returns deterministic default workflow data', async () => {
		await expect(
			new DemoControllerFactory().todos().extractPromises(actor, { selection })
		).resolves.toMatchObject({ createdTodos: [{ title: 'Send the design' }] });
	});
	it('returns intentional empty states', async () => {
		await expect(
			new DemoControllerFactory('empty').references().suggestFromSelection(actor, { selection })
		).resolves.toEqual({ outcome: 'nothing_relevant', anchorId: demoIds.anchor });
	});
	it('returns intentional error states', async () => {
		await expect(
			new DemoControllerFactory('error').relationships().suggestFromSelection(actor, { selection })
		).rejects.toThrow('Demo scenario failure');
	});
	it('streams deterministic agent events', async () => {
		const events = [];
		for await (const event of new DemoControllerFactory()
			.agent()
			.run(actor, { prompt: 'Draft it' }))
			events.push(event);
		expect(events).toHaveLength(3);
	});
	it('returns the demo note tree in the shell context', async () => {
		await expect(
			new DemoControllerFactory().workspace().getShellContext(actor)
		).resolves.toMatchObject({
			noteTree: expect.arrayContaining([expect.objectContaining(pinnedSummary)])
		});
	});
	it('counts pending suggestions in the shell context', async () => {
		await expect(
			new DemoControllerFactory().workspace().getShellContext(actor)
		).resolves.toMatchObject({ pendingSuggestionCount: 5 });
	});
	it('returns an empty today view for the empty scenario', async () => {
		await expect(
			new DemoControllerFactory('empty').workspace().getTodayView(actor, { today })
		).resolves.toMatchObject({ overdue: [], dueToday: [], waitingOn: [] });
	});
	it('surfaces overdue todos on the today view', async () => {
		const view = await new DemoControllerFactory().workspace().getTodayView(actor, { today });
		expect(view.overdue.map((item) => item.todo.title)).toEqual(['Follow up on security review']);
	});
	it('resolves a note view by id', async () => {
		await expect(
			new DemoControllerFactory().notes().get(actor, { noteId: demoIds.note })
		).resolves.toMatchObject({ note: { id: demoIds.note } });
	});
	it('creates a note titled from the input', async () => {
		await expect(
			new DemoControllerFactory().notes().create(actor, { title: 'Fresh note' })
		).resolves.toMatchObject({ note: { title: 'Fresh note' } });
	});
	it('filters todos by waiting-on responsibility', async () => {
		const output = await new DemoControllerFactory()
			.todos()
			.list(actor, { responsibility: 'waiting_on' });
		expect(output.todos.map((view) => view.todo.title)).toEqual(['Jan to send the API spec']);
	});
	it('applies status updates to todos', async () => {
		await expect(
			new DemoControllerFactory().todos().update(actor, { todoId: demoIds.todo, status: 'done' })
		).resolves.toMatchObject({ todo: { id: demoIds.todo, status: 'done' } });
	});
	it('lists the demo skill', async () => {
		await expect(new DemoControllerFactory().skills().list(actor)).resolves.toMatchObject({
			skills: [{ name: 'ADR format' }]
		});
	});
	it('loads a skill view with its usage log', async () => {
		const view = await new DemoControllerFactory()
			.skills()
			.get(actor, { noteId: demoSkillView.skill.note.id });
		expect(view.usages).toHaveLength(2);
	});
	it('groups proposed suggestions by note', async () => {
		const output = await new DemoControllerFactory()
			.suggestions()
			.list(actor, { status: 'proposed' });
		expect(output.groups.length).toBeGreaterThan(1);
	});
	it('lists trust policies for every pipeline', async () => {
		const output = await new DemoControllerFactory().trustPolicies().list(actor);
		expect(output.policies.map((policy) => policy.pipeline)).toEqual([
			'extract_promises',
			'relate',
			'reference',
			'agent'
		]);
	});
	it('applies trust policy updates', async () => {
		await expect(
			new DemoControllerFactory()
				.trustPolicies()
				.update(actor, { pipeline: 'relate', autoAcceptEnabled: true })
		).resolves.toMatchObject({ policy: { pipeline: 'relate', autoAcceptEnabled: true } });
	});
	it('propagates the error scenario through domain controllers', async () => {
		await expect(
			new DemoControllerFactory('error').workspace().getShellContext(actor)
		).rejects.toThrow('Demo scenario failure');
	});
});
