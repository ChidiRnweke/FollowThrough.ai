import { describe, it, expect } from 'vitest';
import type { ActorContext, UserId } from '$lib/models/identity';
import type { ConversationId, Message } from '$lib/models/agent';
import type { ProjectId } from '$lib/models/projects';
import type { SearchDocument, SearchMatch } from '$lib/models/knowledge-search';
import type { Condenser, KnowledgeSearcher } from '$lib/server/services/knowledge-search/contracts';
import type { ConversationJournal } from '$lib/server/services/agent/runs/contracts';
import { Retrieval } from './controller';

const actor: ActorContext = { userId: 'user-1' as UserId };

const message = (role: Message['role'], text: string): Message => ({
	id: `m-${text}` as Message['id'],
	conversationId: 'conv-1' as ConversationId,
	role,
	content: { text },
	createdAt: '2026-01-01T00:00:00Z' as Message['createdAt']
});

const searchMatch = (content: string): SearchMatch => ({
	document: {
		id: 'doc-1' as SearchDocument['id'],
		projectId: 'project-1' as ProjectId,
		content,
		contentHash: 'h',
		sourceRevision: 1,
		chunkIndex: 0
	},
	score: 0.9
});

class RecordingSearcher implements KnowledgeSearcher {
	query = '';
	constructor(private readonly results: readonly SearchMatch[] = []) {}
	async search(_actor: ActorContext, query: string): Promise<readonly SearchMatch[]> {
		this.query = query;
		return this.results;
	}
}

const condenser: Condenser = { condense: async () => 'CONDENSED' };
const journalOf = (messages: readonly Message[]): ConversationJournal =>
	({ listMessages: async () => messages }) as unknown as ConversationJournal;

describe('Retrieval', () => {
	it('uses the raw query when there is no conversation id', async () => {
		const searcher = new RecordingSearcher();
		await new Retrieval({
			knowledgeSearcher: searcher,
			condenser,
			conversations: journalOf([])
		}).search(actor, { query: 'raw query' });
		expect(searcher.query).toBe('raw query');
	});

	it('uses the raw query when the conversation has no prior turns', async () => {
		const searcher = new RecordingSearcher();
		await new Retrieval({
			knowledgeSearcher: searcher,
			condenser,
			conversations: journalOf([message('user', 'first')])
		}).search(actor, { query: 'raw query', conversationId: 'conv-1' as ConversationId });
		expect(searcher.query).toBe('raw query');
	});

	it('condenses the conversation into the search query when multi-turn', async () => {
		const searcher = new RecordingSearcher();
		await new Retrieval({
			knowledgeSearcher: searcher,
			condenser,
			conversations: journalOf([message('user', 'a'), message('assistant', 'b')])
		}).search(actor, { query: 'follow up', conversationId: 'conv-1' as ConversationId });
		expect(searcher.query).toBe('CONDENSED');
	});

	it('trims result content to an excerpt', async () => {
		const searcher = new RecordingSearcher([searchMatch('x'.repeat(2000))]);
		const results = await new Retrieval({
			knowledgeSearcher: searcher,
			condenser,
			conversations: journalOf([])
		}).search(actor, { query: 'q' });
		expect(results[0]!.content.length).toBe(700);
	});
});
