import { expect, it } from 'vitest';
import { WorkspaceMutationReceipts } from './mutation-receipts';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	InMemoryWorkspaceNoteReads,
	InMemoryWorkspaceReceipts
} from '$lib/testing/sync/fakes/in-memory-workspace-writes';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { syncEtag } from '$lib/models/sync';
import type { NoteMutationRequest } from '$lib/models/workspace-mutations';

const input: NoteMutationRequest = {
	operationId: 'a0000000-0000-4000-8000-000000000001',
	baseEtag: syncEtag(1n),
	command: { kind: 'renameNote', noteId: testNoteId(), title: 'Changed title' }
};
const setup = () => {
	const content = new InMemoryNoteContent();
	const receipts = new InMemoryWorkspaceReceipts();
	const service = new WorkspaceMutationReceipts({
		mutationReceipts: receipts,
		syncObjects: new InMemoryWorkspaceNoteReads(content)
	});
	return { content, receipts, service };
};

it('returns the observed note when its version matches the requested base', async () => {
	const { content, service } = setup();
	content.notes = [noteBuilder()];
	expect(await service.prepare(testActor(), input)).toEqual({
		kind: 'ready',
		current: {
			kind: 'found',
			snapshot: {
				etag: syncEtag(1n),
				value: { type: 'notes', value: noteBuilder() }
			}
		}
	});
});

it('does not acknowledge an operation that produced no authoritative resource', async () => {
	const { service } = setup();
	await expect(service.complete(testActor(), input)).rejects.toThrow('no authoritative resource');
});

it('stores proof of the authoritative version when the controller completes a write', async () => {
	const { content, receipts, service } = setup();
	content.notes = [noteBuilder({ title: 'Changed title', currentRevision: 2 })];
	await service.complete(testActor(), input);
	expect(await receipts.find(testActor(), input.operationId, JSON.stringify(input))).toEqual({
		kind: 'proven',
		proof: { operationId: input.operationId, resourceKind: 'found', etag: syncEtag(2n) }
	});
});
