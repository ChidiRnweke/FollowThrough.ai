import { describe, expect, it } from 'vitest';
import type { AttachmentUpload, ProjectId, UserId } from '$lib/models';
import type { OwnedAttachmentUpload } from '$lib/server/repositories';
import { UploadRetention } from './retention';

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
		checksumSha256: 'abc',
		expiresAt: expiresAt as AttachmentUpload['expiresAt'],
		createdAt: expiresAt as AttachmentUpload['createdAt']
	}
});

class FakeUploadStore {
	deleted: string[] = [];
	cutoffs: Date[] = [];

	constructor(private readonly rows: readonly OwnedAttachmentUpload[] = []) {}

	async listExpiredUploads(before: Date, limit: number): Promise<readonly OwnedAttachmentUpload[]> {
		this.cutoffs.push(before);
		return this.rows.filter((row) => new Date(row.upload.expiresAt) < before).slice(0, limit);
	}

	async deleteUpload(_actor: unknown, id: AttachmentUpload['id']): Promise<void> {
		this.deleted.push(id);
	}
}

class FakeObjectStore {
	removed: string[] = [];
	failOn?: string;

	async remove(objectKey: string): Promise<void> {
		if (objectKey === this.failOn) throw new Error('object store unavailable');
		this.removed.push(objectKey);
	}
}

const sweep = (store: FakeUploadStore, objects: FakeObjectStore, graceMs = 60 * 60 * 1000) =>
	new UploadRetention(
		store as unknown as ConstructorParameters<typeof UploadRetention>[0],
		objects as unknown as ConstructorParameters<typeof UploadRetention>[1],
		{ now, graceMs, logger: { error: () => {}, log: () => {} } }
	);

describe('Expired upload sweep', () => {
	it('removes the orphaned object of an abandoned upload', async () => {
		const store = new FakeUploadStore([uploadAt('2026-07-28T09:00:00.000Z')]);
		const objects = new FakeObjectStore();

		await sweep(store, objects).run();

		expect(objects.removed).toEqual(['staging/a']);
	});

	it('deletes the reservation row', async () => {
		const store = new FakeUploadStore([uploadAt('2026-07-28T09:00:00.000Z')]);

		await sweep(store, new FakeObjectStore()).run();

		expect(store.deleted).toHaveLength(1);
	});

	it('leaves uploads inside the grace period alone', async () => {
		const store = new FakeUploadStore([uploadAt('2026-07-28T11:50:00.000Z')]);

		await sweep(store, new FakeObjectStore()).run();

		expect(store.deleted).toEqual([]);
	});

	it('applies the grace period to the cutoff it queries with', async () => {
		const store = new FakeUploadStore();

		await sweep(store, new FakeObjectStore()).run();

		expect(store.cutoffs[0]?.toISOString()).toBe('2026-07-28T11:00:00.000Z');
	});

	it('still reclaims the row when the object is already gone', async () => {
		const store = new FakeUploadStore([uploadAt('2026-07-28T09:00:00.000Z')]);
		const objects = new FakeObjectStore();
		objects.failOn = 'staging/a';

		await sweep(store, objects).run();

		expect(store.deleted).toHaveLength(1);
	});

	it('keeps sweeping after one upload fails', async () => {
		const store = new FakeUploadStore([
			uploadAt('2026-07-28T09:00:00.000Z', 'a'),
			uploadAt('2026-07-28T09:00:00.000Z', 'b')
		]);
		const objects = new FakeObjectStore();
		objects.failOn = 'staging/a';

		await sweep(store, objects).run();

		expect(store.deleted).toHaveLength(2);
	});

	it('does nothing when no uploads have expired', async () => {
		const store = new FakeUploadStore();
		const objects = new FakeObjectStore();

		await sweep(store, objects).run();

		expect(objects.removed).toEqual([]);
	});
});
