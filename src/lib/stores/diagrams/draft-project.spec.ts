import { describe, expect, it } from 'vitest';
import type { Conversation } from '$lib/models/agent';
import { conversationProjectId } from './draft-project';
import { noteBuilder, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

describe('Conversation diagram project resolution', () => {
	it('uses the conversation project when it has one', () => {
		const conversation = { contextProjectId: testProjectId(2) } as Conversation;
		expect(conversationProjectId(conversation, [noteBuilder()])).toBe(testProjectId(2));
	});

	it('uses the origin note project when the conversation was note-scoped', () => {
		const note = noteBuilder({ projectId: testProjectId(3) });
		const conversation = { contextNoteId: note.id } as Conversation;
		expect(conversationProjectId(conversation, [note])).toBe(testProjectId(3));
	});

	it('does not invent a project for an unscoped conversation', () => {
		expect(conversationProjectId({} as Conversation, [noteBuilder()])).toBeUndefined();
	});
});
