import { expect, it } from 'vitest';
import type { MaintenanceCursors } from '$lib/models/maintenance';
import { MaintenanceCursorRecords } from '$lib/server/repositories/maintenance/postgres/cursors';
import { context } from '../database-harness';

const position = (id: string): MaintenanceCursors['expired-upload-sweep'] => ({
	cutoff: '2026-07-12T08:00:00.000Z' as MaintenanceCursors['expired-upload-sweep']['cutoff'],
	after: {
		expiresAt: '2026-07-12T07:00:00.000Z' as MaintenanceCursors['expired-upload-sweep']['cutoff'],
		id: id as MaintenanceCursors['expired-upload-sweep']['after']['id']
	}
});

it('keeps one position per task across saves and forgets it when the pass ends', async () => {
	const records = new MaintenanceCursorRecords(context.db);
	const first = position('00000000-0000-4000-8000-0000000000a1');
	const second = position('00000000-0000-4000-8000-0000000000a2');
	await records.save('expired-upload-sweep', first);
	const saved = await records.find('expired-upload-sweep');
	await records.save('expired-upload-sweep', second);
	const advanced = await new MaintenanceCursorRecords(context.db).find('expired-upload-sweep');
	await records.remove('expired-upload-sweep');
	expect({
		saved,
		advanced,
		ended: await records.find('expired-upload-sweep')
	}).toEqual({ saved: first, advanced: second, ended: undefined });
});
