import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteSyncStatus from './note-sync-status.svelte';
import type { DateTime } from '$lib/models/workspace';

const updatedAt = '2026-10-10T08:00:00.000Z' as DateTime;

describe('note sync status', () => {
	it('reads a write queued while online as syncing, not as a failed sync', async () => {
		const screen = render(NoteSyncStatus, {
			status: 'pending',
			updatedAt,
			onRetry: () => {},
			onReview: () => {}
		});
		await expect.element(screen.getByText('Syncing…')).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain('retry sync');
	});
});
