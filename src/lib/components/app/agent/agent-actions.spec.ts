import { describe, expect, it } from 'vitest';
import { agentActions, type AgentActionSpec } from './agent-actions';

const all = (): AgentActionSpec[] => Object.values(agentActions);

describe('Invocation points stay inside the space their screen gives them', () => {
	it('keeps every label short enough not to wrap an action cluster', () => {
		expect(all().filter((action) => action.label.length > 22)).toEqual([]);
	});

	it('keeps every prompt short enough to sit on one line in the docked panel', () => {
		expect(all().filter((action) => action.prompt.length > 55)).toEqual([]);
	});
});

describe('Invocation points speak the house voice', () => {
	it('opens every prompt with an imperative rather than a bare question', () => {
		expect(all().filter((action) => action.prompt.endsWith('?'))).toEqual([]);
	});

	it('leaves the trailing period off, like the chat starters', () => {
		expect(all().filter((action) => action.prompt.endsWith('.'))).toEqual([]);
	});
});

describe('Invocation points stay anchored in notes', () => {
	// The thesis: notes are the artifact, and todos, memory, attachments and
	// artifacts are all downstream of them. A prompt that never mentions notes is
	// usually a general-assistant prompt that has drifted in.
	// The selection prompt acts on highlighted text inside a note that is already
	// open, so naming the note again would be redundant rather than grounding.
	const noteless = ['diagram', 'settings', 'skillDetail', 'selection'] as const;

	it('names notes in every prompt except the few that act on something else', () => {
		const drifted = Object.entries(agentActions)
			.filter(([key]) => !noteless.includes(key as (typeof noteless)[number]))
			.filter(([, action]) => !/notes?\b/i.test(action.prompt))
			.map(([key]) => key);
		expect(drifted).toEqual([]);
	});

	it('sends the todos screen back to the notes rather than into triage', () => {
		expect(agentActions.todosFromNotes.prompt).toContain('notes');
	});

	it('names what the project action returns instead of a vague verb', () => {
		expect(agentActions.projectConnect.prompt).toContain('backlinks');
	});
});
