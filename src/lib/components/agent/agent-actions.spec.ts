import { describe, expect, it } from 'vitest';
import { agentActions } from './agent-actions';

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

	it('names what the project action returns instead of a vague verb', () => {
		expect(agentActions.projectConnect.prompt).toContain('backlinks');
	});
});
