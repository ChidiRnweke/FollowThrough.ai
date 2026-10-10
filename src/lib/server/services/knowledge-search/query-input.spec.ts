import { describe, expect, it } from 'vitest';
import type { ConversationId, Message, StoredMessage } from '$lib/models/agent';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { KnowledgeLookup } from './semantic';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';

const message = (text: string): StoredMessage => ({
	kind: 'readable',
	id: crypto.randomUUID() as Message['id'],
	conversationId: '00000000-0000-4000-8000-000000000051' as ConversationId,
	role: 'user',
	content: { text },
	createdAt: testNow
});
describe('search query context', () => {
	it('keeps the original query when there is no conversation history', () => {
		expect(new KnowledgeLookup(new InMemorySearchRepository()).queryInput('raw query', [])).toEqual(
			{ kind: 'direct', query: 'raw query' }
		);
	});
	it('keeps the original query before a conversation has prior turns', () => {
		expect(
			new KnowledgeLookup(new InMemorySearchRepository()).queryInput('raw query', [
				message('first')
			])
		).toEqual({
			kind: 'direct',
			query: 'raw query'
		});
	});
	it('includes the conversation and current query when the search spans multiple turns', () => {
		expect(
			new KnowledgeLookup(new InMemorySearchRepository()).queryInput('follow up', [
				message('a'),
				message('b')
			])
		).toEqual({
			kind: 'conversation',
			transcript: 'a\nb\nuser: follow up'
		});
	});
});
