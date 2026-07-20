import type { InlineContextBrief } from '$lib/models';
import type { InlineBriefCache, InlineSuggestionThrottle } from '$lib/services';

/**
 * Process-local cache for inline context briefs. Briefs are cheap to rebuild
 * and worthless once the passage moves on, so they never reach the database.
 * A cold process stays silent until the first grounded brief lands.
 */

const DEFAULT_TTL_MS = 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;

interface Entry {
	readonly brief: InlineContextBrief;
	readonly expiresAt: number;
}

export interface InlineBriefCacheOptions {
	readonly ttlMs?: number;
	readonly maxEntries?: number;
	readonly now?: () => number;
}

export class MemoryInlineBriefCache implements InlineBriefCache {
	private readonly entries = new Map<string, Entry>();
	private readonly pending = new Map<string, Promise<InlineContextBrief>>();
	private readonly ttlMs: number;
	private readonly maxEntries: number;
	private readonly now: () => number;

	constructor(options: InlineBriefCacheOptions = {}) {
		this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
		this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
		this.now = options.now ?? Date.now;
	}

	get(key: string): InlineContextBrief | undefined {
		const entry = this.entries.get(key);
		if (!entry) return undefined;
		if (entry.expiresAt <= this.now()) {
			this.entries.delete(key);
			return undefined;
		}
		// Re-insert so iteration order tracks recency for eviction.
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.brief;
	}

	set(key: string, brief: InlineContextBrief): void {
		this.entries.delete(key);
		this.entries.set(key, { brief, expiresAt: this.now() + this.ttlMs });
		while (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value;
			if (oldest === undefined) break;
			this.entries.delete(oldest);
		}
	}

	getOrLoad(key: string, load: () => Promise<InlineContextBrief>): Promise<InlineContextBrief> {
		const cached = this.get(key);
		if (cached) return Promise.resolve(cached);
		const active = this.pending.get(key);
		if (active) return active;
		const pending = load().finally(() => this.pending.delete(key));
		this.pending.set(key, pending);
		return pending;
	}
}

const DEFAULT_REQUESTS_PER_MINUTE = 40;
const MINUTE_MS = 60_000;

export interface InlineSuggestionThrottleOptions {
	readonly requestsPerMinute?: number;
	readonly now?: () => number;
}

/**
 * Process-local spend guard. Ghost text is fired by a timer rather than by a
 * deliberate user action, so the budget lives on the server and is not
 * something a runaway client can talk its way past.
 */
export class MemoryInlineSuggestionThrottle implements InlineSuggestionThrottle {
	private readonly inFlight = new Set<string>();
	private readonly recent = new Map<string, number[]>();
	private readonly limit: number;
	private readonly now: () => number;

	constructor(options: InlineSuggestionThrottleOptions = {}) {
		this.limit = options.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE;
		this.now = options.now ?? Date.now;
	}

	admit(userId: string): boolean {
		if (this.inFlight.has(userId)) return false;
		const now = this.now();
		const window = (this.recent.get(userId) ?? []).filter(
			(timestamp) => now - timestamp < MINUTE_MS
		);
		if (window.length >= this.limit) {
			this.recent.set(userId, window);
			return false;
		}
		this.recent.set(userId, [...window, now]);
		this.inFlight.add(userId);
		return true;
	}

	release(userId: string): void {
		this.inFlight.delete(userId);
	}
}

/**
 * Cache identity for one caret position. The revision and the tail of the
 * passage are both in the key, so a brief never outlives the text it describes
 * and never crosses users or notes.
 */
export const inlineBriefKey = (input: {
	readonly userId: string;
	readonly noteId: string;
	readonly projectId: string;
	readonly heading?: string;
	readonly passageLength: number;
}): string => {
	// Keyed at section altitude only. Not per keystroke (the passage tail changes
	// every character) and deliberately NOT per revision: the editor autosaves as
	// the user types, so revision advances on nearly every pause. Keying on it
	// meant every suggestion was a fresh miss and grounding never warmed. The
	// TTL bounds staleness instead; one brief per section is reused throughout.
	const section = `${input.projectId}:${input.heading ?? ''}:${Math.floor(input.passageLength / 300)}`;
	let hash = 2166136261;
	for (let index = 0; index < section.length; index++) {
		hash ^= section.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `${input.userId}:${input.noteId}:${(hash >>> 0).toString(36)}`;
};
