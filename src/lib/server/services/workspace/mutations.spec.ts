import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import type { WorkspaceMutationRequest } from '$lib/models/workspace-mutations';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	InMemoryWorkspaceNoteReads,
	InMemoryWorkspaceReceipts
} from '$lib/testing/sync/fakes/in-memory-workspace-writes';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { SyncMutationTransactions } from './mutations';

const input: WorkspaceMutationRequest = {
	operationId: 'a0000000-0000-4000-8000-000000000001',
	baseEtag: syncEtag(1n),
	command: { kind: 'renameNote', noteId: testNoteId(), title: 'My rename' }
};
const setup = () => {
	const content = new InMemoryNoteContent();
	content.notes = [noteBuilder()];
	const mutationReceipts = new InMemoryWorkspaceReceipts();
	const transactionRunner = new InMemoryTransactionRunner([content, mutationReceipts]);
	const notes = new Notes(
		capabilityDependencies<NotesDependencies>({
			noteReader: content,
			noteEditor: content,
			noteIndexer: content,
			transactionRunner
		})
	);
	const dependencies = {
		mutationReceipts,
		transactionRunner,
		syncObjects: new InMemoryWorkspaceNoteReads(content)
	};
	const transactions = new SyncMutationTransactions(dependencies);
	const apply = (request: WorkspaceMutationRequest) =>
		transactions.run(testActor(), request, async () => {
			if (request.command.kind !== 'renameNote')
				throw new Error('Test operation must rename a note');
			await notes.rename(testActor(), request.command);
		});
	return { content, mutationReceipts, apply };
};

describe('guarded workspace mutation replay', () => {
	it('uses the ordinary domain operation after its base version matches', async () => {
		const { content, apply } = setup();
		await apply(input);
		expect(content.notes[0]?.title).toBe('My rename');
	});

	it('returns the authoritative remote version on conflict without replacing it', async () => {
		const { content, apply } = setup();
		content.notes = [noteBuilder({ title: 'Other device', currentRevision: 2 })];
		const result = await apply(input);
		expect(result).toEqual({
			kind: 'conflict',
			remote: {
				kind: 'found',
				snapshot: { etag: syncEtag(2n), value: { type: 'notes', value: content.notes[0] } }
			}
		});
	});

	it('returns the same receipt when an acknowledged operation is retried', async () => {
		const { apply } = setup();
		const first = await apply(input);
		expect(await apply(input)).toEqual(first);
	});

	it('rejects changing a previously applied operation’s input', async () => {
		const { apply } = setup();
		await apply(input);
		expect(await apply({ ...input, baseEtag: syncEtag(2n) })).toEqual({
			kind: 'rejected',
			message: 'The operation ID was already used for different input'
		});
	});

	it('rolls back a domain mutation if saving its receipt fails', async () => {
		const { content, mutationReceipts, apply } = setup();
		mutationReceipts.writeFailure = 'Storage unavailable';
		await apply(input).catch(() => {
			return { kind: 'failure' };
		});
		expect(content.notes[0]).toEqual(noteBuilder());
	});
});
