import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
	Conversation,
	ConversationId,
	DateTime,
	Message,
	MessageId,
	Note,
	NoteId,
	SearchDocument,
	SearchDocumentId,
	UserId
} from '$lib/models';
import type { PostgresTestContext } from '$lib/server/db/testcontainer';
import { startPostgresTestcontainer } from '$lib/server/db/testcontainer';
import * as schema from '$lib/server/db/schema';
import { PostgresConversationRepository } from './postgres-conversations';
import { PostgresProjectRepository } from './postgres-projects';
import { PostgresRetrievalIndexRepository } from './postgres-search';
import { PostgresUserRepository } from './postgres-users';
import { PostgresNoteRepository } from './postgres-notes';

let context: PostgresTestContext;
const actor = (suffix: string) => ({
	userId: `10000000-0000-4000-8000-${suffix.padStart(12, '0')}` as UserId
});
const now = '2026-07-12T08:00:00.000Z' as DateTime;

beforeAll(async () => {
	context = await startPostgresTestcontainer();
}, 120_000);

afterAll(async () => {
	await context?.stop();
});

describe('Postgres project repository invariants', () => {
	it('does not reveal a project to another actor', async () => {
		const owner = actor('1');
		const repository = new PostgresProjectRepository(context.db);
		const project = await repository.insert(owner, { name: 'Private project' });
		expect(await repository.findById(actor('2'), project.id)).toBeUndefined();
	});

	it('hides an archived project from active lookup', async () => {
		const owner = actor('3');
		const repository = new PostgresProjectRepository(context.db);
		const project = await repository.insert(owner, { name: 'Archived project' });
		await repository.archive(owner, project.id);
		expect(await repository.findById(owner, project.id)).toBeUndefined();
	});

	it('allows an archived project name to be reused', async () => {
		const owner = actor('4');
		const repository = new PostgresProjectRepository(context.db);
		const project = await repository.insert(owner, { name: 'Reusable' });
		await repository.archive(owner, project.id);
		const replacement = await repository.insert(owner, { name: 'reusable' });
		expect(replacement.name).toBe('reusable');
	});
});

describe('Postgres user repository invariants', () => {
	it('does not reveal another actor’s user record', async () => {
		const owner = actor('5');
		const repository = new PostgresUserRepository(context.db);
		await repository.ensureLocal(owner);
		expect(await repository.findById(actor('6'), owner.userId)).toBeUndefined();
	});
});

describe('Postgres note repository invariants', () => {
	it('maps an inserted note back to the domain model', async () => {
		const owner = actor('11');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'Note repository'
		});
		const timestamp = now;
		const note: Note = {
			id: '40000000-0000-4000-8000-000000000011' as NoteId,
			userId: owner.userId,
			projectId: project.id,
			kind: 'note',
			position: 0,
			title: 'Repository note',
			document: { type: 'doc', content: [] },
			plainText: 'content',
			currentRevision: 1,
			isPinned: false,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		const repository = new PostgresNoteRepository(context.db);
		await repository.insert(owner, note);
		expect(await repository.findById(owner, note.id)).toEqual(note);
	});

	it('does not reveal a note to another actor', async () => {
		const owner = actor('12');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'Private note repository'
		});
		const note: Note = {
			id: '40000000-0000-4000-8000-000000000012' as NoteId,
			userId: owner.userId,
			projectId: project.id,
			kind: 'note',
			position: 0,
			title: 'Private note',
			document: { type: 'doc', content: [] },
			plainText: '',
			currentRevision: 1,
			isPinned: false,
			createdAt: now,
			updatedAt: now
		};
		const repository = new PostgresNoteRepository(context.db);
		await repository.insert(owner, note);
		expect(await repository.findById(actor('13'), note.id)).toBeUndefined();
	});
});

describe('Postgres conversation repository invariants', () => {
	it('returns messages in chronological order', async () => {
		const owner = actor('7');
		await new PostgresUserRepository(context.db).ensureLocal(owner);
		const repository = new PostgresConversationRepository(context.db);
		const conversation: Conversation = {
			id: '20000000-0000-4000-8000-000000000007' as ConversationId,
			userId: owner.userId,
			title: 'Ordering',
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, conversation);
		for (const [index, text] of ['first', 'second'].entries()) {
			const message: Message = {
				id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as MessageId,
				conversationId: conversation.id,
				role: 'user',
				content: { text },
				createdAt: new Date(Date.parse(now) + index * 1000).toISOString() as DateTime
			};
			await repository.appendMessage(owner, message);
		}
		const messages = await repository.listMessages(owner, conversation.id);
		expect(messages.map((message) => message.content.text)).toEqual(['first', 'second']);
	});

	it('does not reveal a conversation to another actor', async () => {
		const owner = actor('8');
		await new PostgresUserRepository(context.db).ensureLocal(owner);
		const repository = new PostgresConversationRepository(context.db);
		const conversation: Conversation = {
			id: '20000000-0000-4000-8000-000000000008' as ConversationId,
			userId: owner.userId,
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, conversation);
		expect(await repository.findById(actor('9'), conversation.id)).toBeUndefined();
	});

	it('lists only sessions owned by the actor', async () => {
		const owner = actor('14');
		const other = actor('15');
		const users = new PostgresUserRepository(context.db);
		await users.ensureLocal(owner);
		await users.ensureLocal(other);
		const repository = new PostgresConversationRepository(context.db);
		await repository.insert(owner, {
			id: '20000000-0000-4000-8000-000000000014' as ConversationId,
			userId: owner.userId,
			title: 'Owned session',
			createdAt: now,
			updatedAt: now
		});
		await repository.insert(other, {
			id: '20000000-0000-4000-8000-000000000015' as ConversationId,
			userId: other.userId,
			title: 'Foreign session',
			createdAt: now,
			updatedAt: now
		});
		const sessions = await repository.list(owner);
		expect(sessions.map((session) => session.title)).toEqual(['Owned session']);
	});
});

describe('Postgres search repository invariants', () => {
	it('limits vector search to the requested project', async () => {
		const owner = actor('10');
		const projects = new PostgresProjectRepository(context.db);
		const first = await projects.insert(owner, { name: 'Search one' });
		const second = await projects.insert(owner, { name: 'Search two' });
		const noteIds = [
			'40000000-0000-4000-8000-000000000001' as NoteId,
			'40000000-0000-4000-8000-000000000002' as NoteId
		];
		await context.db.insert(schema.notes).values([
			{ id: noteIds[0], userId: owner.userId, projectId: first.id, title: 'First' },
			{ id: noteIds[1], userId: owner.userId, projectId: second.id, title: 'Second' }
		]);
		const vector = Array.from({ length: 3072 }, (_, index) => (index === 0 ? 1 : 0));
		const repository = new PostgresRetrievalIndexRepository(context.db);
		for (const [index, project] of [first, second].entries()) {
			const document: SearchDocument = {
				id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as SearchDocumentId,
				projectId: project.id,
				noteId: noteIds[index]!,
				content: `document ${index}`,
				contentHash: `hash-${index}`,
				sourceRevision: 1,
				chunkIndex: 0,
				embedding: vector,
				embeddingModel: 'contract-model'
			};
			await repository.replaceForNote(owner, noteIds[index]!, [document]);
		}
		const matches = await repository.searchByEmbedding(owner, vector, 10, first.id);
		expect(matches.map((match) => match.document.projectId)).toEqual([first.id]);
	});
});
