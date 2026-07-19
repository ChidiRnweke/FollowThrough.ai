import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Record/replay cache for the auxiliary LLM edges — embeddings, reranking and
 * condensing. Those calls are deterministic enough to be worth freezing: they
 * are not the thing under evaluation, but they cost money and network on every
 * run and would otherwise inject noise into an eval that is trying to isolate
 * agent behaviour.
 *
 * The agent's own model call is deliberately never cached.
 *
 * Set `EVAL_RECORD=1` to bypass stored entries and refresh them from the real
 * provider.
 *
 * Misses are expected in normal use: the agent chooses its own search wording,
 * so a query embedding varies run to run even with the case fixed. A miss
 * therefore falls through to the provider and is recorded, with a warning. Set
 * `EVAL_STRICT_CACHE=1` in CI to turn a miss into a failure instead, so a
 * pipeline that is supposed to be hermetic cannot quietly start making calls.
 */
export class DiskCache {
	private entries: Record<string, unknown> | undefined;
	private dirty = false;

	constructor(private readonly path: string) {}

	static recording(): boolean {
		return process.env.EVAL_RECORD === '1';
	}

	static key(namespace: string, payload: unknown): string {
		const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
		return `${namespace}:${hash.slice(0, 32)}`;
	}

	async resolve<T>(key: string, produce: () => Promise<T>): Promise<T> {
		const entries = await this.load();
		if (!DiskCache.recording() && key in entries) return entries[key] as T;
		if (!DiskCache.recording()) {
			if (process.env.EVAL_STRICT_CACHE === '1')
				throw new Error(
					`Eval cache miss for "${key}" under EVAL_STRICT_CACHE. Re-run with EVAL_RECORD=1 to record it.`
				);
			process.stderr.write(`[evals] cache miss for ${key}; calling the live provider\n`);
		}
		const value = await produce();
		entries[key] = value;
		this.dirty = true;
		return value;
	}

	async flush(): Promise<void> {
		if (!this.dirty || !this.entries) return;
		await mkdir(dirname(this.path), { recursive: true });
		await writeFile(this.path, JSON.stringify(this.entries, null, 0), 'utf8');
		this.dirty = false;
	}

	private async load(): Promise<Record<string, unknown>> {
		if (this.entries) return this.entries;
		try {
			this.entries = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, unknown>;
		} catch {
			this.entries = {};
		}
		return this.entries;
	}
}

/**
 * Embedding vectors dominate the cache file — 3072 float64s per string is about
 * 60 kB as JSON. Base64-encoded Float32 is roughly six times smaller and is
 * lossless at the precision the index stores anyway.
 */
export const encodeVector = (vector: readonly number[]): string =>
	Buffer.from(new Float32Array(vector).buffer).toString('base64');

export const decodeVector = (encoded: string): number[] => {
	const buffer = Buffer.from(encoded, 'base64');
	return Array.from(
		new Float32Array(
			buffer.buffer,
			buffer.byteOffset,
			buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
		)
	);
};
