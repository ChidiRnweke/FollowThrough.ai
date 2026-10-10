import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import type { NoteMutationRequest } from '$lib/models/workspace-mutations';
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
import { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';
import {
	Workspace,
	type WorkspaceDependencies
} from '$lib/server/controllers/workspace/controller';

const input: NoteMutationRequest = {
	operationId: 'a0000000-0000-4000-8000-000000000001',
	baseEtag: syncEtag(1n),
	command: { kind: 'renameNote', noteId: testNoteId(), title: 'My rename' }
};
const setup = () => {
	const content = new InMemoryNoteContent();
	content.notes = [noteBuilder()];
	const mutationReceipts = new InMemoryWorkspaceReceipts();
	const transactionRunner = new InMemoryTransactionRunner([content, mutationReceipts]);
	const mutations = new WorkspaceMutationReceipts({
		mutationReceipts,
		syncObjects: new InMemoryWorkspaceNoteReads(content)
	});
	const notes = new Notes(
		capabilityDependencies<NotesDependencies>({
			syncMutations: mutations,
			syncRetry: 'never',
			noteReader: content,
			noteEditor: content,
			noteIndexer: content,
			transactionRunner
		})
	);
	const workspace = new Workspace(
		capabilityDependencies<WorkspaceDependencies>({
			writeRecovery: mutations,
			transactionRunner
		})
	);
	const apply = (request: NoteMutationRequest) => notes.synchronize(testActor(), request);
	return { content, mutationReceipts, apply, workspace };
};

describe('guarded workspace mutation replay', () => {
	it('does not execute an operation cancelled before submission', async () => {
		const { workspace, apply, content } = setup();
		await workspace.cancelMutation(testActor(), {
			operationId: input.operationId,
			request: JSON.stringify(input)
		});
		await apply(input);
		expect(content.notes[0]?.title).toBe(noteBuilder().title);
	});
	it('keeps a cancelled operation cancelled on repeated cancellation', async () => {
		const { workspace } = setup();
		const cancellation = { operationId: input.operationId, request: JSON.stringify(input) };
		await workspace.cancelMutation(testActor(), cancellation);
		expect(await workspace.cancelMutation(testActor(), cancellation)).toEqual({
			kind: 'cancelled'
		});
	});
	it('recovers the applied receipt instead of undoing an edit when cancellation arrives later', async () => {
		const { workspace, apply } = setup();
		const applied = await apply(input);
		if (applied.kind !== 'applied' || applied.receipt.resource.kind !== 'found')
			throw new Error('Expected applied note');
		expect(
			await workspace.cancelMutation(testActor(), {
				operationId: input.operationId,
				request: JSON.stringify(input)
			})
		).toEqual({
			kind: 'proven',
			proof: {
				operationId: input.operationId,
				resourceKind: 'found',
				etag: applied.receipt.resource.snapshot.etag
			}
		});
	});
	it('retains original version proof after a later edit', async () => {
		const { apply, content } = setup();
		const saved = await apply(input);
		if (saved.kind !== 'applied' || saved.receipt.resource.kind !== 'found')
			throw new Error('The rename must apply');
		content.notes = [noteBuilder({ title: 'Later edit', currentRevision: 10 })];
		expect(await apply(input)).toEqual({
			kind: 'proven',
			proof: {
				operationId: input.operationId,
				resourceKind: 'found',
				etag: saved.receipt.resource.snapshot.etag
			}
		});
	});
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

it('reports a missing referenced resource as a rejected sync edit', async () => {
	const { content, apply } = setup();
	const failure = Object.assign(new Error('Referenced project disappeared'), { code: '23503' });
	content.saveFailure = failure;
	expect(await apply(input)).toEqual({
		kind: 'rejected',
		message: 'A referenced item is no longer available. Review or discard this change.'
	});
});

it.each(['23502', '23514'])('preserves unexpected constraint %s inside sync', async (code) => {
	const { content, apply } = setup();
	const failure = Object.assign(new Error('Invalid domain write'), { code });
	content.saveFailure = failure;
	await expect(apply(input)).rejects.toBe(failure);
});
