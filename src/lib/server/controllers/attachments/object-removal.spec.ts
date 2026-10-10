import { expect, it } from 'vitest';
import {
	InMemoryAttachmentRepository,
	InMemoryStorage
} from '$lib/testing/attachments/fakes/processing';
import { AttachmentObjectRemoval } from './object-removal';

const setup = () => {
	const records = new InMemoryAttachmentRepository();
	records.pendingObjectRemovals.add('objects/doc');
	const storage = new InMemoryStorage();
	return { records, storage, worker: new AttachmentObjectRemoval(records, storage) };
};
it('removes committed objects and their cleanup records', async () => {
	const { records, storage, worker } = setup();
	await worker.run();
	expect({ objects: [...storage.objects], pending: [...records.pendingObjectRemovals] }).toEqual({
		objects: [],
		pending: []
	});
});
it('keeps failures queued and still removes later objects', async () => {
	const { records, storage, worker } = setup();
	storage.removalFailures.add('objects/doc');
	records.pendingObjectRemovals.add('objects/second');
	storage.objects.add('objects/second');
	const outcome = await worker.run().then(
		() => 'removed',
		() => 'failure'
	);
	expect({
		outcome,
		objects: [...storage.objects],
		pending: [...records.pendingObjectRemovals]
	}).toEqual({ outcome: 'failure', objects: ['objects/doc'], pending: ['objects/doc'] });
});
it('recovers after an object removal succeeds but its acknowledgement was lost', async () => {
	const { records, storage, worker } = setup();
	storage.objects.clear();
	await worker.run();
	await worker.run();
	expect([...records.pendingObjectRemovals]).toEqual([]);
});
it('retries a failed object on the next pass', async () => {
	const { records, storage, worker } = setup();
	storage.removalFailures.add('objects/doc');
	await worker.run().then(
		() => undefined,
		() => undefined
	);
	storage.removalFailures.clear();
	await worker.run();
	expect({ objects: [...storage.objects], pending: [...records.pendingObjectRemovals] }).toEqual({
		objects: [],
		pending: []
	});
});
