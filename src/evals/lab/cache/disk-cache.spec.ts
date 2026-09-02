import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DiskCache, strictCacheEnabled } from './disk-cache';

/** A throwaway cache directory, removed however the test ends. */
const withCacheDirectory = async <T>(use: (directory: string) => Promise<T>): Promise<T> => {
	const directory = await mkdtemp(join(tmpdir(), 'followthrough-cache-'));
	try {
		return await use(directory);
	} finally {
		await rm(directory, { recursive: true });
	}
};

const quarantined = async (directory: string): Promise<string | undefined> =>
	(await readdir(directory)).find((name) => name.includes('.corrupt-'));

describe('deterministic eval cache enforcement', () => {
	it('uses the documented EVAL_STRICT_CACHE variable', () => {
		expect(strictCacheEnabled({ EVAL_STRICT_CACHE: '1' })).toBe(true);
	});

	it('rejects a deterministic miss in strict mode', async () => {
		await withCacheDirectory(async (directory) => {
			const cache = new DiskCache(join(directory, 'cache.json'), true);
			await expect(
				cache.resolve('embed:missing', async () => 'live', { deterministic: true })
			).rejects.toThrow('Deterministic eval cache miss');
		});
	});
});

describe('reading the eval cache file', () => {
	it('serves a stored entry instead of calling the provider', async () => {
		await withCacheDirectory(async (directory) => {
			const path = join(directory, 'cache.json');
			await writeFile(path, JSON.stringify({ 'embed:1': [1, 2, 3] }), 'utf8');
			const cache = new DiskCache(path, false);
			expect(await cache.resolve('embed:1', async () => [9])).toEqual([1, 2, 3]);
		});
	});

	// The cast this replaced trusted the file because this class had written it,
	// which holds until a run is killed mid-write.
	it('quarantines a cache file that is not JSON', async () => {
		await withCacheDirectory(async (directory) => {
			const path = join(directory, 'cache.json');
			await writeFile(path, '{ "embed:1": [1, 2', 'utf8');
			const cache = new DiskCache(path, false);
			await cache.resolve('embed:1', async () => 'live');
			expect(await quarantined(directory)).toBeDefined();
		});
	});

	it('keeps the evidence of what the unreadable file held', async () => {
		await withCacheDirectory(async (directory) => {
			const path = join(directory, 'cache.json');
			await writeFile(path, '{ "embed:1": [1, 2', 'utf8');
			const cache = new DiskCache(path, false);
			await cache.resolve('embed:1', async () => 'live');
			const moved = await quarantined(directory);
			expect(await readFile(join(directory, moved ?? ''), 'utf8')).toBe('{ "embed:1": [1, 2');
		});
	});

	// Syntactically fine and still not a cache: every entry is looked up by key.
	it('quarantines a cache file whose top level is not an object', async () => {
		await withCacheDirectory(async (directory) => {
			const path = join(directory, 'cache.json');
			await writeFile(path, JSON.stringify(['not', 'a', 'cache']), 'utf8');
			const cache = new DiskCache(path, false);
			await cache.resolve('embed:1', async () => 'live');
			expect(await quarantined(directory)).toBeDefined();
		});
	});

	it('still answers the caller from the provider after quarantining', async () => {
		await withCacheDirectory(async (directory) => {
			const path = join(directory, 'cache.json');
			await writeFile(path, '{ truncated', 'utf8');
			const cache = new DiskCache(path, false);
			expect(await cache.resolve('embed:1', async () => 'live')).toBe('live');
		});
	});

	it('refuses to store a value a JSON round trip would not hand back', async () => {
		await withCacheDirectory(async (directory) => {
			const cache = new DiskCache(join(directory, 'cache.json'), false);
			await expect(cache.resolve('embed:1', async () => new Date())).rejects.toThrow(
				'cannot be cached'
			);
		});
	});
});
