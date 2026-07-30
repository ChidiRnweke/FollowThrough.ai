import { describe, expect, it } from 'vitest';
import { testActor, testNoteId, testProjectId } from '$lib/testing/fixtures/domain-builders';
import { InMemoryConversationRepository } from '$lib/testing/fakes/in-memory-conversations';
import { ConversationArchive } from './archive';

describe('Conversation visibility invariants', () => {
	it('does not list workflow conversations as chat sessions', async () => {
		const journal = new ConversationArchive(new InMemoryConversationRepository());
		await journal.getOrCreate(testActor(), { prompt: 'Hello' });
		await journal.createWorkflow(testActor(), {
			title: 'Generate Mermaid diagram',
			contextNoteId: testNoteId()
		});
		expect(await journal.listConversations(testActor())).toHaveLength(1);
	});

	it('marks background diagram conversations as workflows', async () => {
		const journal = new ConversationArchive(new InMemoryConversationRepository());
		const conversation = await journal.createWorkflow(testActor(), {
			title: 'Generate Mermaid diagram'
		});
		expect(conversation.kind).toBe('workflow');
	});

	it('captures the project that triggered a new chat', async () => {
		const journal = new ConversationArchive(new InMemoryConversationRepository());
		const conversation = await journal.getOrCreate(testActor(), {
			prompt: 'Summarise this project',
			projectId: testProjectId(3)
		});
		expect(conversation.contextProjectId).toBe(testProjectId(3));
	});

	it('limits recent chat sessions at the journal boundary', async () => {
		const journal = new ConversationArchive(new InMemoryConversationRepository());
		for (const prompt of ['One', 'Two', 'Three'])
			await journal.getOrCreate(testActor(), { prompt });
		expect(await journal.listConversations(testActor(), { limit: 2 })).toHaveLength(2);
	});

	it('trims a renamed chat title', async () => {
		const journal = new ConversationArchive(new InMemoryConversationRepository());
		const conversation = await journal.getOrCreate(testActor(), { prompt: 'Original' });
		const renamed = await journal.rename(testActor(), conversation.id, '  Decision notes  ');
		expect(renamed.title).toBe('Decision notes');
	});

	it('discards the rewound question and every turn after it', async () => {
		const journal = new ConversationArchive(new InMemoryConversationRepository());
		const conversation = await journal.getOrCreate(testActor(), { prompt: 'First' });
		await journal.recordUserPrompt(testActor(), conversation.id, 'First');
		await journal.recordAssistantText(testActor(), conversation.id, 'First answer');
		await journal.recordUserPrompt(testActor(), conversation.id, 'Second');
		await journal.recordAssistantText(testActor(), conversation.id, 'Second answer');
		await journal.truncateFromUserMessage(testActor(), conversation.id, 2);
		expect(await journal.listMessages(testActor(), conversation.id)).toHaveLength(2);
	});

	it('keeps the turns before the rewound question', async () => {
		const journal = new ConversationArchive(new InMemoryConversationRepository());
		const conversation = await journal.getOrCreate(testActor(), { prompt: 'First' });
		await journal.recordUserPrompt(testActor(), conversation.id, 'First');
		await journal.recordAssistantText(testActor(), conversation.id, 'First answer');
		await journal.recordUserPrompt(testActor(), conversation.id, 'Second');
		await journal.truncateFromUserMessage(testActor(), conversation.id, 2);
		const remaining = await journal.listMessages(testActor(), conversation.id);
		expect(remaining.at(-1)?.content.text).toBe('First answer');
	});

	it('leaves the transcript alone when the ordinal is past the last question', async () => {
		const journal = new ConversationArchive(new InMemoryConversationRepository());
		const conversation = await journal.getOrCreate(testActor(), { prompt: 'Only' });
		await journal.recordUserPrompt(testActor(), conversation.id, 'Only');
		await journal.truncateFromUserMessage(testActor(), conversation.id, 2);
		expect(await journal.listMessages(testActor(), conversation.id)).toHaveLength(1);
	});

	it('permanently removes a chat session', async () => {
		const journal = new ConversationArchive(new InMemoryConversationRepository());
		const conversation = await journal.getOrCreate(testActor(), { prompt: 'Temporary' });
		await journal.remove(testActor(), conversation.id);
		expect(await journal.listConversations(testActor())).toHaveLength(0);
	});
});
