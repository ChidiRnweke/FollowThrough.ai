import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DiskCache, strictCacheEnabled } from './disk-cache';

describe('deterministic eval cache enforcement', () => {
	it('uses the documented EVAL_STRICT_CACHE variable', () => {
		expect(strictCacheEnabled({ EVAL_STRICT_CACHE: '1' })).toBe(true);
	});

	it('rejects a deterministic miss in strict mode', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'followthrough-cache-'));
		try {
			const cache = new DiskCache(join(directory, 'cache.json'), true);
			await expect(
				cache.resolve('embed:missing', async () => 'live', { deterministic: true })
			).rejects.toThrow('Deterministic eval cache miss');
		} finally {
			await rm(directory, { recursive: true });
		}
	});
});
