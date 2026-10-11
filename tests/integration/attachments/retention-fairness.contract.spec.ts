import { InMemoryMaintenanceProgress } from '$lib/testing/maintenance/fakes/in-memory-maintenance-progress';
import { expect, it } from 'vitest';
import type { AttachmentUploadId } from '$lib/models/attachments';
import type { DateTime } from '$lib/models/workspace';
import {
	AttachmentBacklogRecords,
	AttachmentRecords
} from '$lib/server/repositories/attachments/postgres/attachments';
import { AttachmentBacklogService } from '$lib/server/services/attachments/records';
import { UploadRetention } from '$lib/server/controllers/attachments/retention';
import { InMemoryUploadObjects } from '$lib/testing/attachments/fakes/upload-retention';
import { context, seedNote } from '../database-harness';

it('advances past a failed reservation when equal expiry times span PostgreSQL pages', async () => {
	const { owner, project } = await seedNote('33001');
	const records = new AttachmentRecords(owner, context.db);
	// This global worker's cutoff predates the other contract fixtures.
	const expiresAt = '2000-01-01T09:00:00.000Z' as DateTime;
	const uploads = [];
	for (const suffix of ['a', 'b']) {
		const id = crypto.randomUUID() as AttachmentUploadId;
		uploads.push(
			await records.createUpload({
				id,
				projectId: project.id,
				path: `expired-${suffix}.txt`,
				objectKey: `staging/${id}`,
				mediaType: 'text/plain',
				byteSize: 10,
				checksumSha256: 'a'.repeat(64),
				expiresAt,
				createdAt: '2000-01-01T08:50:00.000Z' as DateTime
			})
		);
	}
	uploads.sort((a, b) => a.id.localeCompare(b.id));
	const objects = new InMemoryUploadObjects();
	objects.failOn = uploads[0]!.objectKey;
	const worker = new UploadRetention(
		new AttachmentBacklogService(new AttachmentBacklogRecords(context.db)),
		objects,
		new InMemoryMaintenanceProgress(),
		{
			now: () => new Date('2000-01-01T12:00:00.000Z'),
			maxPerTick: 1,
			logger: { error: () => {}, log: () => {} }
		}
	);
	await worker.run();
	await worker.run();
	expect(
		await Promise.all(uploads.map(async (upload) => Boolean(await records.findUpload(upload.id))))
	).toEqual([true, false]);
});
