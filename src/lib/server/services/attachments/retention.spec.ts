import { describe, expect, it } from 'vitest';
import type { AttachmentUpload } from '$lib/models/attachments';
import type { ProjectId } from '$lib/models/projects';
import type { UserId } from '$lib/models/identity';
import type { OwnedAttachmentUpload } from '$lib/server/repositories/attachments/attachments';
import { UploadRetention } from './retention';
import {
	InMemoryUploadReservations,
	InMemoryUploadObjects
} from '$lib/testing/attachments/fakes/upload-retention';

const owner = '00000000-0000-4000-8000-000000000001' as UserId;
const now = () => new Date('2026-07-28T12:00:00.000Z');

const uploadAt = (expiresAt: string, id = 'a'): OwnedAttachmentUpload => ({
	userId: owner,
	upload: {
		id: `00000000-0000-4000-8000-00000000000${id}` as AttachmentUpload['id'],
		projectId: '00000000-0000-4000-8000-0000000000ff' as ProjectId,
		path: 'docs/report.pdf',
		objectKey: `staging/${id}`,
		mediaType: 'application/pdf',
		byteSize: 10,
		checksumSha256: 'a'.repeat(64),
		expiresAt: expiresAt as AttachmentUpload['expiresAt'],
		createdAt: new Date(
			new Date(expiresAt).getTime() - 600_000
		).toISOString() as AttachmentUpload['createdAt']
	}
});

const sweep = (
	store: InMemoryUploadReservations,
	objects: InMemoryUploadObjects,
	graceMs = 60 * 60 * 1000
) =>
	new UploadRetention(store, objects, { now, graceMs, logger: { error: () => {}, log: () => {} } });

describe('Expired upload sweep', () => {
	it('removes the orphaned object of an abandoned upload', async () => {
		const store = new InMemoryUploadReservations([uploadAt('2026-07-28T09:00:00.000Z')]);
		const objects = new InMemoryUploadObjects();

		await sweep(store, objects).run();

		expect(objects.removed).toEqual(['staging/a']);
		expect(store.deleted).toHaveLength(1);
	});

	it('leaves uploads inside the grace period alone', async () => {
		const store = new InMemoryUploadReservations([uploadAt('2026-07-28T11:50:00.000Z')]);

		await sweep(store, new InMemoryUploadObjects()).run();

		expect(store.deleted).toEqual([]);
	});

	it('applies the grace period to the cutoff it queries with', async () => {
		const store = new InMemoryUploadReservations();

		await sweep(store, new InMemoryUploadObjects()).run();

		expect(store.cutoffs[0]?.toISOString()).toBe('2026-07-28T11:00:00.000Z');
	});

	it('still reclaims the row when the object is already gone', async () => {
		const store = new InMemoryUploadReservations([uploadAt('2026-07-28T09:00:00.000Z')]);
		const objects = new InMemoryUploadObjects();
		objects.absent.add('staging/a');

		await sweep(store, objects).run();

		expect(store.deleted).toHaveLength(1);
	});

	it('keeps the failed reservation and continues sweeping', async () => {
		const store = new InMemoryUploadReservations([
			uploadAt('2026-07-28T09:00:00.000Z', 'a'),
			uploadAt('2026-07-28T09:00:00.000Z', 'b')
		]);
		const objects = new InMemoryUploadObjects();
		objects.failOn = 'staging/a';

		await sweep(store, objects).run();

		expect(store.deleted).toEqual(['00000000-0000-4000-8000-00000000000b']);
	});

	it('does nothing when no uploads have expired', async () => {
		const store = new InMemoryUploadReservations();
		const objects = new InMemoryUploadObjects();

		await sweep(store, objects).run();

		expect(objects.removed).toEqual([]);
	});
});

it('reaches later expired uploads when an earlier object repeatedly fails deletion', async () => {
	const store = new InMemoryUploadReservations([
		uploadAt('2026-07-28T09:00:00.000Z', 'a'),
		uploadAt('2026-07-28T09:00:00.000Z', 'b')
	]);
	const objects = new InMemoryUploadObjects();
	objects.failOn = 'staging/a';
	const worker = new UploadRetention(store, objects, {
		now,
		maxPerTick: 1,
		logger: { error: () => {}, log: () => {} }
	});
	await worker.run();
	await worker.run();
	expect(store.rows.map((row) => row.upload.objectKey)).toEqual(['staging/a']);
});

it('retries a failed reservation after completing the current expiry pass', async () => {
	const store = new InMemoryUploadReservations([
		uploadAt('2026-07-28T09:00:00.000Z', 'a'),
		uploadAt('2026-07-28T10:00:00.000Z', 'b')
	]);
	const objects = new InMemoryUploadObjects();
	objects.failOn = 'staging/a';
	const worker = new UploadRetention(store, objects, {
		now,
		maxPerTick: 1,
		logger: { error: () => {}, log: () => {} }
	});
	await worker.run();
	await worker.run();
	objects.failOn = undefined;
	await worker.run();
	expect(store.rows).toEqual([]);
});

it('finishes its original expiry pass before newly expired arrivals can postpone retries', async () => {
	const store = new InMemoryUploadReservations([
		uploadAt('2026-07-28T09:00:00.000Z', 'a'),
		uploadAt('2026-07-28T10:00:00.000Z', 'b')
	]);
	const objects = new InMemoryUploadObjects();
	objects.failOn = 'staging/a';
	let time = now();
	const worker = new UploadRetention(store, objects, {
		now: () => time,
		maxPerTick: 1,
		logger: { error: () => {}, log: () => {} }
	});
	await worker.run();
	time = new Date('2026-07-28T13:00:00.000Z');
	store.rows.push(uploadAt('2026-07-28T11:30:00.000Z', 'c'));
	await worker.run();
	objects.failOn = undefined;
	await worker.run();
	expect(store.rows.map((row) => row.upload.objectKey)).toEqual(['staging/c']);
});

it('finishes a reservation after its object was removed but its database deletion failed', async () => {
	const first = uploadAt('2026-07-28T09:00:00.000Z', 'a');
	const store = new InMemoryUploadReservations([first, uploadAt('2026-07-28T09:00:00.000Z', 'b')]);
	store.deleteFailures.add(first.upload.id);
	const objects = new InMemoryUploadObjects();
	const worker = new UploadRetention(store, objects, {
		now,
		maxPerTick: 1,
		logger: { error: () => {}, log: () => {} }
	});
	await worker.run();
	await worker.run();
	store.deleteFailures.clear();
	await worker.run();
	expect({ remaining: store.rows, absent: objects.absent.has(first.upload.objectKey) }).toEqual({
		remaining: [],
		absent: true
	});
});
