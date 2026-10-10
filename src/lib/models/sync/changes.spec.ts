import { expect, it } from 'vitest';
import { resourceStateSchema } from './index';
import { syncEtag } from '$lib/services/sync/versions';
import { z } from 'zod';
it('rejects a persisted version without its complete body', () => {
	expect(
		resourceStateSchema(z.string()).safeParse({ kind: 'present', snapshot: { etag: syncEtag(1n) } })
			.success
	).toBe(false);
});
