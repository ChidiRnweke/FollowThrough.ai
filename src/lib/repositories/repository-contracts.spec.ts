/* eslint-disable @typescript-eslint/no-explicit-any -- projections cover heterogeneous repository outputs */
import { describe, expect, it } from 'vitest';
import type { ActorContext, UserId } from '../models';
import { createUnimplementedCapability, demoIds, demoSuggestion } from '../factories';
import type {
	EntityRepository,
	NoteRepository,
	RelationshipRepository,
	SearchRepository,
	SuggestionRepository,
	TodoRepository
} from './index';

const actor: ActorContext = { userId: demoIds.user };
const otherActor: ActorContext = { userId: '00000000-0000-4000-8000-000000000099' as UserId };
interface Case {
	name: string;
	run: () => Promise<unknown>;
	read: (value: any) => unknown;
	expected: unknown;
}
function contracts(name: string, cases: readonly Case[]) {
	describe(name, () => {
		it.each(cases)('$name', async ({ run, read, expected }) => {
			await expect(run().then(read)).resolves.toEqual(expected);
		});
	});
}

const notes = createUnimplementedCapability<NoteRepository>('NoteRepository');
const todos = createUnimplementedCapability<TodoRepository>('TodoRepository');
const entities = createUnimplementedCapability<EntityRepository>('EntityRepository');
const relationships =
	createUnimplementedCapability<RelationshipRepository>('RelationshipRepository');
const suggestions = createUnimplementedCapability<SuggestionRepository>('SuggestionRepository');
const search = createUnimplementedCapability<SearchRepository>('SearchRepository');

contracts('NoteRepository contract', [
	{
		name: 'returns a note to its owner',
		run: () => notes.findById(actor, demoIds.note),
		read: (v) => v?.id,
		expected: demoIds.note
	},
	{
		name: 'does not reveal another user’s note',
		run: () => notes.findById(otherActor, demoIds.note),
		read: (v) => v,
		expected: undefined
	},
	{
		name: 'orders recent notes newest first',
		run: () => notes.listRecent(actor, 10),
		read: (v) => v.map((n: any) => n.id),
		expected: [demoIds.note]
	},
	{
		name: 'returns only pinned notes',
		run: () => notes.listPinned(actor),
		read: (v) => v.every((n: any) => n.isPinned),
		expected: true
	},
	{
		name: 'keeps revisions in ascending order',
		run: () => notes.listRevisions(actor, demoIds.note),
		read: (v) => v.map((r: any) => r.revision),
		expected: [1, 2]
	}
]);
contracts('TodoRepository contract', [
	{
		name: 'excludes soft-deleted todos from active lists',
		run: () => todos.list(actor, { statuses: ['open'] }),
		read: (v) => v.every((t: any) => !t.deletedAt),
		expected: true
	},
	{
		name: 'filters waiting-on todos',
		run: () => todos.list(actor, { responsibility: 'waiting_on' }),
		read: (v) => v.every((t: any) => t.responsibility === 'waiting_on'),
		expected: true
	},
	{
		name: 'does not reveal another user’s todo',
		run: () => todos.findById(otherActor, demoIds.todo),
		read: (v) => v,
		expected: undefined
	}
]);
contracts('EntityRepository contract', [
	{
		name: 'finds names case-insensitively within type',
		run: () => entities.findByName(actor, 'client', 'ACME'),
		read: (v) => v?.name,
		expected: 'Acme'
	},
	{
		name: 'scopes identical entity names by user',
		run: () => entities.findByName(otherActor, 'client', 'Acme'),
		read: (v) => v,
		expected: undefined
	}
]);
contracts('RelationshipRepository contract', [
	{
		name: 'deduplicates a relationship kind between notes',
		run: () => relationships.listForNote(actor, demoIds.note),
		read: (v) => new Set(v.map((r: any) => `${r.sourceNoteId}:${r.targetNoteId}:${r.kind}`)).size,
		expected: 1
	},
	{
		name: 'does not reveal another user’s relationships',
		run: () => relationships.listForNote(otherActor, demoIds.note),
		read: (v) => v,
		expected: []
	}
]);
contracts('SuggestionRepository contract', [
	{
		name: 'lists only the requested lifecycle state',
		run: () => suggestions.list(actor, { status: 'proposed' }),
		read: (v) => v.every((s: any) => s.status === 'proposed'),
		expected: true
	},
	{
		name: 'does not reveal another user’s suggestion',
		run: () => suggestions.findById(otherActor, demoSuggestion.id),
		read: (v) => v,
		expected: undefined
	}
]);
contracts('SearchRepository contract', [
	{
		name: 'returns only user-owned search matches',
		run: () => search.search(actor, 'OAuth', 10),
		read: (v) => v.every((m: any) => m.document.noteId === demoIds.note),
		expected: true
	},
	{
		name: 'does not return another user’s indexed content',
		run: () => search.search(otherActor, 'OAuth', 10),
		read: (v) => v,
		expected: []
	}
]);
