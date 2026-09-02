import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
	readAgentPayloadObject,
	readAgentPayload,
	type AgentPayload
} from '$lib/models/agent/payload';

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

/**
 * What was on disk, as three separate answers — the shape `result-log.ts` uses,
 * for the same reason: an unreadable file and an absent one are different facts
 * and the caller has to be able to tell them apart.
 *
 * The cast this replaced said the file held `Record<string, AgentPayload>`
 * because it had been written by this class, which is true right up to the run
 * where it is not — a truncated write, a hand edit, a half-flushed process. The
 * cached entries are handed to callers as their own `T`, so a file holding a
 * string, an array, or a JSON fragment used to reach an eval as a value that
 * type-checked and was not one.
 */
type CacheContents =
	| { readonly kind: 'entries'; readonly entries: Record<string, AgentPayload> }
	| { readonly kind: 'absent' }
	| { readonly kind: 'corrupt'; readonly reason: string };

const readCacheFile = async (path: string): Promise<CacheContents> => {
	let raw: string;
	try {
		raw = await readFile(path, 'utf8');
	} catch (error) {
		if (isMissingFile(error)) return { kind: 'absent' };
		throw error;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return { kind: 'corrupt', reason: error instanceof Error ? error.message : String(error) };
	}
	const read = readAgentPayloadObject(parsed);
	return read.kind === 'corrupt'
		? { kind: 'corrupt', reason: read.message }
		: { kind: 'entries', entries: { ...read.value } };
};

/**
 * Moved rather than overwritten, and reported.
 *
 * Starting a fresh cache in silence would be the expensive kind of quiet: every
 * entry the file held is a provider call this run will now make and pay for, and
 * an eval that started billing again would look exactly like one that did not.
 * The file itself is kept because whatever produced it is a bug worth the
 * evidence.
 */
const quarantine = async (path: string, reason: string): Promise<void> => {
	const moved = `${path}.corrupt-${Date.now()}`;
	await rename(path, moved);
	process.stderr.write(
		`[evals] aux cache was unreadable (${reason}); moved to ${moved} and started a new one. ` +
			'Every entry it held will be fetched from the provider again.\n'
	);
};

/**
 * What an aux response becomes before it is cached: nothing may enter the file
 * that a later `JSON.parse` could not hand back, so a value the wire type
 * cannot carry is refused loudly instead of stored and corrupted at replay.
 */
const cacheValueOf = (value: unknown): AgentPayload => {
	const read = readAgentPayload(value);
	if (read.kind === 'corrupt')
		throw new Error(`Eval aux response is not JSON and cannot be cached: ${read.message}`);
	return read.value;
};

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
 *
 * Every entry survives `JSON.stringify` / `JSON.parse` round trips — the whole
 * file is written and read as JSON — which is exactly the promise the `AgentPayload`
 * wire type makes, so it is the storage type.
 */
export class DiskCache {
	private entries: Record<string, AgentPayload> | undefined;
	private dirty = false;
	private readonly counters = { hits: 0, misses: 0, live: 0 };

	constructor(
		private readonly path: string,
		private readonly strictDeterministic = strictCacheEnabled()
	) {}

	static recording(): boolean {
		return process.env.EVAL_RECORD === '1';
	}

	static key(namespace: string, payload: unknown): string {
		const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
		return `${namespace}:${hash.slice(0, 32)}`;
	}

	async resolve<T>(
		key: string,
		produce: () => Promise<T>,
		options: { deterministic?: boolean } = {}
	): Promise<T> {
		const entries = await this.load();
		if (!DiskCache.recording() && key in entries) {
			this.counters.hits += 1;
			// The entry survived a JSON round trip in this cache's own file, so a
			// value that satisfies the caller's `T` needs no further shape check.
			// audit-allow: shape-cast — `T` is the caller's declared payload type, and no static check can re-verify a JSON round trip here.
			return entries[key] as unknown as T;
		}
		this.counters.misses += 1;
		if (!DiskCache.recording()) {
			if (options.deterministic && this.strictDeterministic)
				throw new Error(
					`Deterministic eval cache miss for "${key}". Re-run test:evals:cache or record the cache intentionally.`
				);
			process.stderr.write(
				`[evals] ${options.deterministic ? 'deterministic cache miss' : 'dynamic live call'} for ${key}\n`
			);
		}
		this.counters.live += 1;
		const value = await produce();
		entries[key] = cacheValueOf(value);
		this.dirty = true;
		return value;
	}

	async flush(): Promise<void> {
		if (!this.dirty || !this.entries) return;
		await mkdir(dirname(this.path), { recursive: true });
		const contents = await readCacheFile(this.path);
		if (contents.kind === 'corrupt') await quarantine(this.path, contents.reason);
		const onDisk = contents.kind === 'entries' ? contents.entries : {};
		await writeFile(this.path, JSON.stringify({ ...onDisk, ...this.entries }, null, 0), 'utf8');
		this.dirty = false;
	}

	stats(): Readonly<{ hits: number; misses: number; live: number }> {
		return { ...this.counters };
	}

	private async load(): Promise<Record<string, AgentPayload>> {
		if (this.entries) return this.entries;
		const contents = await readCacheFile(this.path);
		if (contents.kind === 'corrupt') await quarantine(this.path, contents.reason);
		this.entries = contents.kind === 'entries' ? contents.entries : {};
		return this.entries;
	}
}

export const strictCacheEnabled = (
	environment: Readonly<Record<string, string | undefined>> = process.env
): boolean => environment.EVAL_STRICT_CACHE === '1';

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
