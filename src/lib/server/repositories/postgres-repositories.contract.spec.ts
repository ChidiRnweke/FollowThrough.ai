import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
	Conversation,
	ConversationId,
	DateTime,
	AgentRun,
	AgentRunId,
	Artifact,
	ArtifactId,
	DiagramId,
	ExternalReference,
	MemoryEntryId,
	Message,
	MessageId,
	Note,
	NoteId,
	NoteRelationship,
	Provenance,
	ProvenanceId,
	ReferenceId,
	RelationshipId,
	SearchDocument,
	SearchDocumentId,
	SkillUsageId,
	SuggestionId,
	TodoId,
	TemplateId,
	Url,
	UserId
} from '$lib/models';
import type { PostgresTestContext } from '$lib/server/db/testcontainer';
import { startPostgresTestcontainer } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import * as schema from '$lib/server/db/schema';
import { PostgresConversationRepository } from './postgres-conversations';
import { PostgresProjectRepository } from './postgres-projects';
import { PostgresRetrievalIndexRepository } from './postgres-search';
import { PostgresUserRepository } from './postgres-users';
import { PostgresNoteRepository } from './postgres-notes';
import { PostgresDiagramRepository } from './postgres-diagrams';
import { PostgresProvenanceRepository } from './postgres-provenance';
import { PostgresReferenceRepository } from './postgres-references';
import { PostgresRelationshipRepository } from './postgres-relationships';
import { PostgresSkillRepository } from './postgres-skills';
import { PostgresSuggestionRepository } from './postgres-suggestions';
import { PostgresTodoRepository } from './postgres-todos';
import { PostgresTrustPolicyRepository } from './postgres-trust-policies';
import { PostgresMemoryEntryRepository } from './postgres-memory-entries';
import { PostgresArtifactRepository } from './postgres-artifacts';
import { PostgresExportSettingsRepository } from './postgres-export-settings';
import {
	PostgresAgentPreferencesRepository,
	PostgresAgentRunRepository
} from './postgres-agent-settings';
import {
	PostgresAgentRunDecisionRepository,
	PostgresAgentRunEventRepository
} from './postgres-agent-runs';

let context: PostgresTestContext;
const actor = (suffix: string) => ({
	userId: `10000000-0000-4000-8000-${suffix.padStart(12, '0')}` as UserId
});
const now = '2026-07-12T08:00:00.000Z' as DateTime;

const seedNote = async (suffix: string, owner = actor(suffix)) => {
	const project = await new PostgresProjectRepository(context.db).insert(owner, {
		name: `Contract project ${suffix}`
	});
	const note: Note = {
		id: `40000000-0000-4000-8000-${suffix.padStart(12, '0')}` as NoteId,
		userId: owner.userId,
		projectId: project.id,
		kind: 'note',
		position: 0,
		title: `Contract note ${suffix}`,
		document: { type: 'doc', content: [] },
		plainText: '',
		currentRevision: 1,
		publishedRevision: 0,
		isPinned: false,
		createdAt: now,
		updatedAt: now
	};
	await new PostgresNoteRepository(context.db).insert(owner, note);
	return { owner, project, note };
};

const seedProvenance = async (owner: ReturnType<typeof actor>, suffix: string) => {
	const provenance: Provenance = {
		id: `60000000-0000-4000-8000-${suffix.padStart(12, '0')}` as ProvenanceId,
		userId: owner.userId,
		producerKind: 'pipeline',
		producerName: 'Contract',
		pipeline: 'agent',
		metadata: {},
		createdAt: now
	};
	await new PostgresProvenanceRepository(context.db).insert(owner, provenance);
	return provenance;
};

const seedArtifact = async (
	owner: ReturnType<typeof actor>,
	projectId: Artifact['projectId'],
	suffix: string,
	patch: Partial<Artifact> = {}
) => {
	const artifact: Artifact = {
		id: `70000000-0000-4000-8000-${suffix.padStart(12, '0')}` as ArtifactId,
		userId: owner.userId,
		projectId,
		title: `Artifact ${suffix}`,
		format: 'pdf',
		objectKey: `artifacts/${suffix}.pdf`,
		byteSize: 100,
		sourceNoteIds: [],
		createdAt: now,
		...patch
	};
	await new PostgresArtifactRepository(context.db).insert(owner, artifact);
	return artifact;
};

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

describe('Postgres artifact repository listing invariants', () => {
	it('matches artifact titles with a case-insensitive substring', async () => {
		const owner = actor('301');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'Artifact search title'
		});
		await seedArtifact(owner, project.id, '301', { title: 'Quarterly Strategy Review' });
		const result = await new PostgresArtifactRepository(context.db).listByProject(
			owner,
			project.id,
			{ query: 'STRATEGY' }
		);
		expect(result.total).toBe(1);
	});

	it('matches artifact formats with a case-insensitive substring', async () => {
		const owner = actor('302');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'Artifact search format'
		});
		await seedArtifact(owner, project.id, '302', { format: 'docx' });
		const result = await new PostgresArtifactRepository(context.db).listByProject(
			owner,
			project.id,
			{ query: 'OCX' }
		);
		expect(result.total).toBe(1);
	});

	it('matches template names with a case-insensitive substring', async () => {
		const owner = actor('303');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'Artifact search template'
		});
		const templateId = '80000000-0000-4000-8000-000000000303' as TemplateId;
		await context.db.insert(schema.projectTemplates).values({
			id: templateId,
			userId: owner.userId,
			projectId: project.id,
			name: 'Executive Briefing',
			objectKey: 'templates/executive.docx',
			mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			byteSize: 100
		});
		await seedArtifact(owner, project.id, '303', { templateId });
		const result = await new PostgresArtifactRepository(context.db).listByProject(
			owner,
			project.id,
			{ query: 'brief' }
		);
		expect(result.total).toBe(1);
	});

	it('does not match a null template for an unrelated search', async () => {
		const owner = actor('304');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'Artifact null template'
		});
		await seedArtifact(owner, project.id, '304');
		const result = await new PostgresArtifactRepository(context.db).listByProject(
			owner,
			project.id,
			{ query: 'missing' }
		);
		expect(result.artifacts).toEqual([]);
	});

	it('keeps artifact listings scoped to the actor and project', async () => {
		const owner = actor('305');
		const other = actor('306');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'Owned artifacts'
		});
		const otherProject = await new PostgresProjectRepository(context.db).insert(other, {
			name: 'Other artifacts'
		});
		await seedArtifact(owner, project.id, '305');
		await seedArtifact(other, otherProject.id, '306');
		const result = await new PostgresArtifactRepository(context.db).listByProject(
			other,
			project.id
		);
		expect(result.total).toBe(0);
	});

	it('counts all filtered artifacts before pagination', async () => {
		const owner = actor('307');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'Artifact count'
		});
		for (let index = 0; index < 12; index += 1) {
			await seedArtifact(owner, project.id, String(30700 + index), { title: `Match ${index}` });
		}
		const result = await new PostgresArtifactRepository(context.db).listByProject(
			owner,
			project.id,
			{ query: 'match', limit: 10 }
		);
		expect(result.total).toBe(12);
	});

	it('returns non-overlapping deterministic pages', async () => {
		const owner = actor('308');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'Artifact pages'
		});
		for (let index = 0; index < 20; index += 1) {
			await seedArtifact(owner, project.id, String(30800 + index));
		}
		const repository = new PostgresArtifactRepository(context.db);
		const first = await repository.listByProject(owner, project.id, { limit: 10, offset: 0 });
		const second = await repository.listByProject(owner, project.id, { limit: 10, offset: 10 });
		expect([...first.artifacts, ...second.artifacts].map((artifact) => artifact.id)).toEqual(
			Array.from(
				{ length: 20 },
				(_, index) => `70000000-0000-4000-8000-${String(30800 + index).padStart(12, '0')}`
			)
		);
	});

	it('keeps omitted listing parameters unbounded', async () => {
		const owner = actor('309');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'Unbounded artifacts'
		});
		for (let index = 0; index < 11; index += 1) {
			await seedArtifact(owner, project.id, String(30900 + index));
		}
		const result = await new PostgresArtifactRepository(context.db).listByProject(
			owner,
			project.id
		);
		expect(result.artifacts).toHaveLength(11);
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
			publishedRevision: 0,
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
			publishedRevision: 0,
			isPinned: false,
			createdAt: now,
			updatedAt: now
		};
		const repository = new PostgresNoteRepository(context.db);
		await repository.insert(owner, note);
		expect(await repository.findById(actor('13'), note.id)).toBeUndefined();
	});

	it('hides a note when its project is archived', async () => {
		const { owner, project, note } = await seedNote('43');
		await new PostgresProjectRepository(context.db).archive(owner, project.id);
		expect(await new PostgresNoteRepository(context.db).findById(owner, note.id)).toBeUndefined();
	});

	it('prevents duplicate built-in skill keys for one actor', async () => {
		const owner = actor('76');
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: 'General'
		});
		const repository = new PostgresNoteRepository(context.db);
		const builtIn = (suffix: string): Note => ({
			id: `40000000-0000-4000-8000-${suffix.padStart(12, '0')}` as NoteId,
			userId: owner.userId,
			projectId: project.id,
			kind: 'skill',
			position: Number(suffix),
			title: `Built-in ${suffix}`,
			builtInKey: 'followthrough',
			document: { type: 'doc', content: [] },
			plainText: '',
			currentRevision: 1,
			publishedRevision: 0,
			isPinned: false,
			createdAt: now,
			updatedAt: now
		});
		await repository.insert(owner, builtIn('76'));
		await expect(repository.insert(owner, builtIn('77'))).rejects.toBeDefined();
	});

	it('applies a note update when the expected revision is current', async () => {
		const { owner, note } = await seedNote('181');
		const repository = new PostgresNoteRepository(context.db);
		const updated = await repository.updateIfRevision(
			owner,
			{ ...note, title: 'Accepted', currentRevision: 2 },
			1
		);
		expect(updated?.title).toBe('Accepted');
	});

	it('rejects a note update when the expected revision is stale', async () => {
		const { owner, note } = await seedNote('182');
		const repository = new PostgresNoteRepository(context.db);
		const updated = await repository.updateIfRevision(
			owner,
			{ ...note, title: 'Stale', currentRevision: 2 },
			2
		);
		expect(updated).toBeUndefined();
	});

	it('allows exactly one concurrent note update from the same revision', async () => {
		const { owner, note } = await seedNote('183');
		const repository = new PostgresNoteRepository(context.db);
		const results = await Promise.all([
			repository.updateIfRevision(owner, { ...note, title: 'Browser A', currentRevision: 2 }, 1),
			repository.updateIfRevision(owner, { ...note, title: 'Browser B', currentRevision: 2 }, 1)
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
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
			kind: 'chat',
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
			kind: 'chat',
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
			kind: 'chat',
			title: 'Owned session',
			createdAt: now,
			updatedAt: now
		});
		await repository.insert(other, {
			id: '20000000-0000-4000-8000-000000000015' as ConversationId,
			userId: other.userId,
			kind: 'chat',
			title: 'Foreign session',
			createdAt: now,
			updatedAt: now
		});
		const sessions = await repository.list(owner);
		expect(sessions.map((session) => session.title)).toEqual(['Owned session']);
	});

	it('persists conversation model and execution-mode overrides', async () => {
		const owner = actor('71');
		await new PostgresUserRepository(context.db).ensureLocal(owner);
		const repository = new PostgresConversationRepository(context.db);
		const conversation = await repository.insert(owner, {
			id: '20000000-0000-4000-8000-000000000071' as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			modelOverride: 'openai/gpt-test',
			executionModeOverride: 'auto_accept',
			createdAt: now,
			updatedAt: now
		});
		expect({
			model: conversation.modelOverride,
			mode: conversation.executionModeOverride
		}).toEqual({ model: 'openai/gpt-test', mode: 'auto_accept' });
	});
});

describe('Postgres agent settings repository invariants', () => {
	it('persists the actor default model and execution mode', async () => {
		const owner = actor('72');
		await new PostgresUserRepository(context.db).ensureLocal(owner);
		const repository = new PostgresAgentPreferencesRepository(context.db);
		const preferences = await repository.upsert(owner, {
			userId: owner.userId,
			defaultModel: 'anthropic/claude-test',
			executionMode: 'auto_accept',
			inlineSuggestionsEnabled: true,
			createdAt: now,
			updatedAt: now
		});
		expect({ model: preferences.defaultModel, mode: preferences.executionMode }).toEqual({
			model: 'anthropic/claude-test',
			mode: 'auto_accept'
		});
	});

	it('does not reveal a paused run to another actor', async () => {
		const owner = actor('73');
		await new PostgresUserRepository(context.db).ensureLocal(owner);
		const conversations = new PostgresConversationRepository(context.db);
		const conversation = await conversations.insert(owner, {
			id: '20000000-0000-4000-8000-000000000073' as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			createdAt: now,
			updatedAt: now
		});
		const repository = new PostgresAgentRunRepository(context.db);
		const run: AgentRun = {
			id: '70000000-0000-4000-8000-000000000073' as AgentRunId,
			userId: owner.userId,
			conversationId: conversation.id,
			model: 'openai/gpt-test',
			executionMode: 'approval_required',
			status: 'awaiting_approval',
			requestId: 'repository-contract-paused-1',
			serializedState: 'serialized-state',
			pendingDecisions: [
				{ callId: 'call-1', toolName: 'create_note', arguments: { title: 'Draft' } }
			],
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, run);
		expect(await repository.findById(actor('74'), run.id)).toBeUndefined();
	});

	it('round-trips serialized paused-run decisions', async () => {
		const owner = actor('75');
		await new PostgresUserRepository(context.db).ensureLocal(owner);
		const conversations = new PostgresConversationRepository(context.db);
		const conversation = await conversations.insert(owner, {
			id: '20000000-0000-4000-8000-000000000075' as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			createdAt: now,
			updatedAt: now
		});
		const repository = new PostgresAgentRunRepository(context.db);
		const run = await repository.insert(owner, {
			id: '70000000-0000-4000-8000-000000000075' as AgentRunId,
			userId: owner.userId,
			conversationId: conversation.id,
			model: 'openai/gpt-test',
			executionMode: 'approval_required',
			status: 'awaiting_approval',
			requestId: 'repository-contract-paused-2',
			serializedState: 'serialized-state',
			pendingDecisions: [
				{ callId: 'call-2', toolName: 'archive_note', arguments: { noteId: 'note-1' } }
			],
			createdAt: now,
			updatedAt: now
		});
		expect({ state: run.serializedState, pending: run.pendingDecisions }).toEqual({
			state: 'serialized-state',
			pending: [{ callId: 'call-2', toolName: 'archive_note', arguments: { noteId: 'note-1' } }]
		});
	});
});

describe('Postgres durable agent run repository invariants', () => {
	const seedQueuedRun = async (suffix: string): Promise<AgentRun> => {
		const owner = actor(suffix);
		await new PostgresUserRepository(context.db).ensureLocal(owner);
		const conversation = await new PostgresConversationRepository(context.db).insert(owner, {
			id: `21000000-0000-4000-8000-${suffix.padStart(12, '0')}` as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			createdAt: now,
			updatedAt: now
		});
		return new PostgresAgentRunRepository(context.db).insert(owner, {
			id: `71000000-0000-4000-8000-${suffix.padStart(12, '0')}` as AgentRunId,
			userId: owner.userId,
			conversationId: conversation.id,
			model: 'openai/gpt-test',
			executionMode: 'approval_required',
			status: 'queued',
			requestId: `request-${suffix}`,
			pendingDecisions: [],
			contextSnapshot: {},
			inputSnapshot: { prompt: 'Contract prompt' },
			createdAt: now,
			updatedAt: now
		});
	};

	it('orders replayed events by their global cursor', async () => {
		const run = await seedQueuedRun('93');
		const events = new PostgresAgentRunEventRepository(context.db);
		await Promise.all([
			events.append(run.id, 0, {
				type: 'run_queued',
				runId: run.id,
				attempt: 1,
				reason: 'submitted'
			}),
			events.append(run.id, 1, { type: 'text_delta', text: 'next' })
		]);
		const owner = actor('93');
		const replay = await events.replay(owner, run.id, '0');
		expect(replay.map((event) => event.cursor)).toEqual(
			[...replay.map((event) => event.cursor)].sort((left, right) => Number(left) - Number(right))
		);
	});

	it('returns the same durable decision for an identical retry', async () => {
		const run = await seedQueuedRun('94');
		const owner = actor('94');
		const decisions = new PostgresAgentRunDecisionRepository(context.db);
		const input = { runId: run.id, callId: 'call-94', decision: 'approve' as const };
		const first = await decisions.record(owner, input);
		const duplicate = await decisions.record(owner, input);
		expect(duplicate).toEqual(first);
	});

	it('rejects overlapping active runs in one conversation', async () => {
		const run = await seedQueuedRun('97');
		const repository = new PostgresAgentRunRepository(context.db);
		await expect(
			repository.insert(actor('97'), {
				...run,
				id: '71000000-0000-4000-8000-000000000197' as AgentRunId,
				requestId: 'request-97-overlap'
			})
		).rejects.toThrow();
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

	it('does not return another actor’s search documents', async () => {
		const { owner, project, note } = await seedNote('47');
		const vector = Array.from({ length: 3072 }, (_, index) => (index === 0 ? 1 : 0));
		const repository = new PostgresRetrievalIndexRepository(context.db);
		await repository.replaceForNote(owner, note.id, [
			{
				id: '50000000-0000-4000-8000-000000000047' as SearchDocumentId,
				projectId: project.id,
				noteId: note.id,
				content: 'private architecture',
				contentHash: 'private-hash',
				sourceRevision: 1,
				chunkIndex: 0,
				embedding: vector,
				embeddingModel: 'contract-model'
			}
		]);
		expect(await repository.searchByEmbedding(actor('48'), vector, 10, project.id)).toEqual([]);
	});
});

describe('Postgres memory-entry repository invariants', () => {
	const seedEntry = async (suffix: string) => {
		const owner = actor(suffix);
		const project = await new PostgresProjectRepository(context.db).insert(owner, {
			name: `Memory project ${suffix}`
		});
		const repository = new PostgresMemoryEntryRepository(context.db);
		const entry = await repository.insert(owner, {
			id: `80000000-0000-4000-8000-${suffix.padStart(12, '0')}` as MemoryEntryId,
			userId: owner.userId,
			projectId: project.id,
			content: `Durable fact ${suffix}`,
			shareWithAgents: true,
			createdAt: now,
			updatedAt: now
		});
		return { owner, project, repository, entry };
	};

	it('round-trips an inserted entry', async () => {
		const { owner, repository, entry } = await seedEntry('60');
		expect(await repository.findById(owner, entry.id)).toEqual(entry);
	});

	it('round-trips a user-profile entry without a project', async () => {
		const { owner, repository } = await seedEntry('69');
		const entry = await repository.insert(owner, {
			id: '80000000-0000-4000-8000-000000000169' as MemoryEntryId,
			userId: owner.userId,
			content: 'I lead the platform team.',
			shareWithAgents: true,
			createdAt: now,
			updatedAt: now
		});
		expect((await repository.findById(owner, entry.id))?.projectId).toBeUndefined();
	});

	it('scopes the user-profile list to entries without a project', async () => {
		const { owner, repository } = await seedEntry('70');
		const profile = await repository.insert(owner, {
			id: '80000000-0000-4000-8000-000000000071' as MemoryEntryId,
			userId: owner.userId,
			content: 'I prefer concise answers.',
			shareWithAgents: true,
			createdAt: now,
			updatedAt: now
		});
		expect((await repository.list(owner, {})).map((item) => item.id)).toEqual([profile.id]);
	});

	it('keeps profile entries out of a project list', async () => {
		const { owner, project, repository, entry } = await seedEntry('72');
		await repository.insert(owner, {
			id: '80000000-0000-4000-8000-000000000073' as MemoryEntryId,
			userId: owner.userId,
			content: 'I prefer concise answers.',
			shareWithAgents: true,
			createdAt: now,
			updatedAt: now
		});
		expect(
			(await repository.list(owner, { projectId: project.id })).map((item) => item.id)
		).toEqual([entry.id]);
	});

	it('does not reveal an entry to another actor', async () => {
		const { repository, entry } = await seedEntry('61');
		expect(await repository.findById(actor('62'), entry.id)).toBeUndefined();
	});

	it('excludes soft-deleted entries from the default list', async () => {
		const { owner, project, repository, entry } = await seedEntry('63');
		await repository.update(owner, { ...entry, deletedAt: now });
		expect(await repository.list(owner, { projectId: project.id })).toEqual([]);
	});

	it('includes soft-deleted entries when requested', async () => {
		const { owner, project, repository, entry } = await seedEntry('64');
		await repository.update(owner, { ...entry, deletedAt: now });
		expect(
			(await repository.list(owner, { projectId: project.id, includeDeleted: true })).map(
				(item) => item.id
			)
		).toEqual([entry.id]);
	});

	it('clears the deletion marker on restore', async () => {
		const { owner, repository, entry } = await seedEntry('65');
		await repository.update(owner, { ...entry, deletedAt: now });
		await repository.update(owner, { ...entry, deletedAt: undefined });
		expect((await repository.findById(owner, entry.id))?.deletedAt).toBeUndefined();
	});

	it('stores memory-sourced search chunks without a note', async () => {
		const { owner, project, entry } = await seedEntry('66');
		const search = new PostgresRetrievalIndexRepository(context.db);
		await search.replaceForMemoryEntry(owner, entry.id, [
			{
				id: '50000000-0000-4000-8000-000000000066' as SearchDocumentId,
				projectId: project.id,
				memoryEntryId: entry.id,
				content: entry.content,
				contentHash: 'memory-hash-66',
				sourceRevision: 1,
				chunkIndex: 0
			}
		]);
		expect((await search.listForMemoryEntry(owner, entry.id))[0]?.noteId).toBeUndefined();
	});

	it('rejects a search chunk without any source', async () => {
		const { owner, project } = await seedEntry('67');
		await expect(
			context.db.insert(schema.searchChunks).values({
				id: '50000000-0000-4000-8000-000000000067',
				userId: owner.userId,
				projectId: project.id,
				content: 'orphan chunk',
				contentHash: 'orphan-hash',
				sourceRevision: 1,
				chunkIndex: 0
			})
		).rejects.toThrow();
	});

	it('deletes memory chunks with their entry', async () => {
		const { owner, project, entry } = await seedEntry('68');
		const search = new PostgresRetrievalIndexRepository(context.db);
		await search.replaceForMemoryEntry(owner, entry.id, [
			{
				id: '50000000-0000-4000-8000-000000000068' as SearchDocumentId,
				projectId: project.id,
				memoryEntryId: entry.id,
				content: entry.content,
				contentHash: 'memory-hash-68',
				sourceRevision: 1,
				chunkIndex: 0
			}
		]);
		await search.deleteForMemoryEntry(owner, entry.id);
		expect(await search.listForMemoryEntry(owner, entry.id)).toEqual([]);
	});
});

describe('Postgres export-settings repository invariants', () => {
	it('returns nothing before settings are saved', async () => {
		const { owner, project } = await seedNote('80');
		const repository = new PostgresExportSettingsRepository(context.db);
		expect(await repository.find(owner, project.id)).toBeUndefined();
	});

	it('round-trips upserted settings', async () => {
		const { owner, project } = await seedNote('81');
		const repository = new PostgresExportSettingsRepository(context.db);
		const settings = { fontFamily: 'times', fontSize: 12, lineHeight: 1.6, margin: 54 } as const;
		await repository.upsert(owner, project.id, settings);
		expect(await repository.find(owner, project.id)).toEqual(settings);
	});

	it('replaces settings on repeated upsert', async () => {
		const { owner, project } = await seedNote('82');
		const repository = new PostgresExportSettingsRepository(context.db);
		await repository.upsert(owner, project.id, {
			fontFamily: 'courier',
			fontSize: 10,
			lineHeight: 1.2,
			margin: 36
		});
		await repository.upsert(owner, project.id, {
			fontFamily: 'helvetica',
			fontSize: 11,
			lineHeight: 1.35,
			margin: 72
		});
		expect((await repository.find(owner, project.id))?.fontFamily).toBe('helvetica');
	});

	it('does not reveal settings to another actor', async () => {
		const { owner, project } = await seedNote('83');
		const repository = new PostgresExportSettingsRepository(context.db);
		await repository.upsert(owner, project.id, {
			fontFamily: 'times',
			fontSize: 12,
			lineHeight: 1.5,
			margin: 60
		});
		expect(await repository.find(actor('84'), project.id)).toBeUndefined();
	});
});

describe('Postgres todo repository invariants', () => {
	it('does not reveal a todo to another actor', async () => {
		const { owner, project } = await seedNote('21');
		const repository = new PostgresTodoRepository(context.db);
		const todo = {
			id: '50000000-0000-4000-8000-000000000021' as TodoId,
			userId: owner.userId,
			projectId: project.id,
			title: 'Private task',
			status: 'open' as const,
			responsibility: 'mine' as const,
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, todo);
		expect(await repository.findById(actor('22'), todo.id)).toBeUndefined();
	});

	it('makes a status update visible through filtered listing', async () => {
		const { owner, project } = await seedNote('45');
		const repository = new PostgresTodoRepository(context.db);
		const todo = await repository.insert(owner, {
			id: '50000000-0000-4000-8000-000000000045' as TodoId,
			userId: owner.userId,
			projectId: project.id,
			title: 'Status task',
			status: 'open',
			responsibility: 'mine',
			createdAt: now,
			updatedAt: now
		});
		await repository.update(owner, { ...todo, status: 'done' });
		expect((await repository.list(owner, { status: 'done' })).map((item) => item.id)).toEqual([
			todo.id
		]);
	});

	it('hides todos from an archived project', async () => {
		const { owner, project } = await seedNote('46');
		const repository = new PostgresTodoRepository(context.db);
		await repository.insert(owner, {
			id: '50000000-0000-4000-8000-000000000046' as TodoId,
			userId: owner.userId,
			projectId: project.id,
			title: 'Archived task',
			status: 'open',
			responsibility: 'mine',
			createdAt: now,
			updatedAt: now
		});
		await new PostgresProjectRepository(context.db).archive(owner, project.id);
		expect(await repository.list(owner, {})).toEqual([]);
	});
});

describe('Postgres provenance repository invariants', () => {
	it('does not reveal provenance to another actor', async () => {
		const { owner } = await seedNote('23');
		const provenance = await seedProvenance(owner, '23');
		expect(
			await new PostgresProvenanceRepository(context.db).findById(actor('24'), provenance.id)
		).toBeUndefined();
	});
});

describe('Postgres trust-policy repository invariants', () => {
	it('lists only policies owned by the actor', async () => {
		const { owner } = await seedNote('25');
		const repository = new PostgresTrustPolicyRepository(context.db);
		await repository.upsert(owner, {
			userId: owner.userId,
			pipeline: 'agent',
			autoAcceptEnabled: false,
			conditions: {},
			createdAt: now,
			updatedAt: now
		});
		expect(await repository.list(actor('26'))).toEqual([]);
	});
});

describe('Postgres suggestion repository invariants', () => {
	it('allows only one transition from the same expected status', async () => {
		const { owner, note, project } = await seedNote('27');
		const provenance = await seedProvenance(owner, '27');
		const repository = new PostgresSuggestionRepository(context.db);
		const suggestion = await repository.insert(owner, {
			id: '70000000-0000-4000-8000-000000000027' as SuggestionId,
			userId: owner.userId,
			noteId: note.id,
			kind: 'todo',
			status: 'proposed',
			payload: { projectId: project.id, title: 'Atomic task', responsibility: 'mine' },
			provenanceId: provenance.id,
			isAutoAccepted: false,
			createdAt: now,
			updatedAt: now
		});
		const results = await Promise.all([
			repository.transition(owner, suggestion.id, 'proposed', { status: 'rejected' }),
			repository.transition(owner, suggestion.id, 'proposed', { status: 'rejected' })
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it('hides suggestions attached to an archived project', async () => {
		const { owner, note, project } = await seedNote('44');
		const provenance = await seedProvenance(owner, '44');
		const repository = new PostgresSuggestionRepository(context.db);
		await repository.insert(owner, {
			id: '70000000-0000-4000-8000-000000000044' as SuggestionId,
			userId: owner.userId,
			noteId: note.id,
			kind: 'todo',
			status: 'proposed',
			payload: { projectId: project.id, title: 'Archived task', responsibility: 'mine' },
			provenanceId: provenance.id,
			isAutoAccepted: false,
			createdAt: now,
			updatedAt: now
		});
		await new PostgresProjectRepository(context.db).archive(owner, project.id);
		expect(await repository.list(owner, { status: 'proposed' })).toEqual([]);
	});
});

describe('Postgres relationship repository invariants', () => {
	it('stores a duplicate semantic edge idempotently', async () => {
		const { owner, note } = await seedNote('28');
		const second: Note = {
			...note,
			id: '40000000-0000-4000-8000-000000000029' as NoteId,
			position: 1
		};
		await new PostgresNoteRepository(context.db).insert(owner, second);
		const repository = new PostgresRelationshipRepository(context.db);
		const relationship: NoteRelationship = {
			id: '80000000-0000-4000-8000-000000000028' as RelationshipId,
			userId: owner.userId,
			sourceNoteId: note.id,
			targetNoteId: second.id,
			kind: 'mentions',
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, relationship);
		await repository.insert(owner, {
			...relationship,
			id: '80000000-0000-4000-8000-000000000029' as RelationshipId
		});
		expect(await repository.listForNote(owner, note.id)).toHaveLength(1);
	});
});

describe('Postgres reference repository invariants', () => {
	it('lists only references owned by the actor', async () => {
		const { owner, note } = await seedNote('30');
		const repository = new PostgresReferenceRepository(context.db);
		const reference: ExternalReference = {
			id: '90000000-0000-4000-8000-000000000030' as ReferenceId,
			userId: owner.userId,
			noteId: note.id,
			url: 'https://example.com/reference' as Url,
			title: 'Reference',
			tier: 'official',
			relevanceNote: 'Contract',
			createdAt: now
		};
		await repository.insert(owner, reference);
		expect(await repository.listForNote(actor('31'), note.id)).toEqual([]);
	});
});

describe('Postgres diagram repository invariants', () => {
	it('limits project listing to the requested project', async () => {
		const { owner, project, note } = await seedNote('32');
		const repository = new PostgresDiagramRepository(context.db);
		await repository.insert(owner, {
			id: 'a0000000-0000-4000-8000-000000000032' as DiagramId,
			userId: owner.userId,
			noteId: note.id,
			kind: 'mermaid',
			source: 'flowchart LR\nA --> B',
			searchableText: 'A B',
			createdAt: now,
			updatedAt: now
		});
		expect((await repository.listForProject(owner, project.id)).map((item) => item.noteId)).toEqual(
			[note.id]
		);
	});
});

describe('Postgres skill repository invariants', () => {
	it('persists skill usage provenance', async () => {
		const { owner, note } = await seedNote('33');
		const provenance = await seedProvenance(owner, '33');
		const repository = new PostgresSkillRepository(context.db);
		await repository.insert(owner, {
			note: { ...note, kind: 'skill' },
			name: 'Contract skill',
			description: 'Contract',
			triggerHints: ['contract'],
			isEnabled: true
		});
		const usage = await repository.recordUsage(owner, {
			id: 'b0000000-0000-4000-8000-000000000033' as SkillUsageId,
			skillNoteId: note.id,
			provenanceId: provenance.id,
			createdAt: now
		});
		expect(usage.provenanceId).toBe(provenance.id);
	});

	it('hides enabled skills from an archived project', async () => {
		const { owner, note, project } = await seedNote('49');
		const repository = new PostgresSkillRepository(context.db);
		await repository.insert(owner, {
			note: { ...note, kind: 'skill' },
			name: 'Archived skill',
			description: 'Contract',
			triggerHints: ['contract'],
			isEnabled: true
		});
		await new PostgresProjectRepository(context.db).archive(owner, project.id);
		expect(await repository.listEnabled(owner)).toEqual([]);
	});
});

describe('Postgres transaction context invariants', () => {
	it('rolls back every write when the transaction fails', async () => {
		const owner = actor('41');
		const transactions = createTransactionContext(context.db);
		try {
			await transactions.transactionRunner.run(async () => {
				await transactions.database.insert(schema.users).values({
					id: owner.userId,
					email: 'rollback@local.invalid',
					displayName: 'Rollback'
				});
				throw new Error('force rollback');
			});
		} catch {
			// The absence of the write is the invariant under test.
		}
		const rows = await context.db
			.select({ id: schema.users.id })
			.from(schema.users)
			.where(eq(schema.users.id, owner.userId));
		expect(rows).toEqual([]);
	});

	it('keeps nested work inside the outer transaction', async () => {
		const owner = actor('42');
		const transactions = createTransactionContext(context.db);
		try {
			await transactions.transactionRunner.run(async () => {
				await transactions.database.insert(schema.users).values({
					id: owner.userId,
					email: 'nested@local.invalid',
					displayName: 'Nested'
				});
				await transactions.transactionRunner.run(async () => {
					await transactions.database.insert(schema.projects).values({
						userId: owner.userId,
						name: 'Nested project'
					});
				});
				throw new Error('force outer rollback');
			});
		} catch {
			// Both outer and nested writes must roll back together.
		}
		const rows = await context.db
			.select({ id: schema.projects.id })
			.from(schema.projects)
			.where(eq(schema.projects.userId, owner.userId));
		expect(rows).toEqual([]);
	});
});
