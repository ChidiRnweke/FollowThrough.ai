import { describe, expect, it } from 'vitest';
import { testActor, testNoteId } from '$lib/testing/fixtures/domain-builders';
import { InMemoryConversationRepository } from '$lib/testing/fakes/in-memory-conversations';
import { PersistentConversationJournal } from './conversations';

describe('Conversation visibility invariants', () => {
	it('does not list workflow conversations as chat sessions', async () => {
		const journal = new PersistentConversationJournal(new InMemoryConversationRepository());
		await journal.getOrCreate(testActor(), { prompt: 'Hello' });
		await journal.createWorkflow(testActor(), {
			title: 'Generate Mermaid diagram',
			contextNoteId: testNoteId()
		});
		expect(await journal.listConversations(testActor())).toHaveLength(1);
	});

	it('marks background diagram conversations as workflows', async () => {
		const journal = new PersistentConversationJournal(new InMemoryConversationRepository());
		const conversation = await journal.createWorkflow(testActor(), {
			title: 'Generate Mermaid diagram'
		});
		expect(conversation.kind).toBe('workflow');
	});
});
