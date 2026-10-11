import { expect, it } from 'vitest';
import { InMemoryMaintenanceCursors } from '$lib/testing/maintenance/fakes/in-memory-maintenance-cursors';
import { MaintenanceProgressService } from './progress';

it('resumes each task from its own position until its pass restarts', async () => {
	const progress = new MaintenanceProgressService(new InMemoryMaintenanceCursors());
	await progress.advance('embedding-backfill', { after: 'note:42' });
	const resumed = await progress.resume('embedding-backfill');
	const otherTask = await progress.resume('expired-upload-sweep');
	await progress.restart('embedding-backfill');
	expect({
		resumed,
		otherTask,
		restarted: await progress.resume('embedding-backfill')
	}).toEqual({ resumed: { after: 'note:42' }, otherTask: undefined, restarted: undefined });
});
