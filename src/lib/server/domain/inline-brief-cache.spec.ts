import { describe, it, expect } from 'vitest';
import {
	inlineBriefKey,
	MemoryInlineBriefCache,
	MemoryInlineSuggestionThrottle
} from './inline-brief-cache';

const brief = { voice: 'terse', facts: [], openThreads: [], avoid: [] };

const key = {
	userId: 'user-1',
	noteId: 'note-1',
	projectId: 'project-1',
	passageLength: 450,
	heading: 'Migration'
};

describe('MemoryInlineBriefCache', () => {
	it('returns a stored brief before it expires', () => {
		const cache = new MemoryInlineBriefCache({ ttlMs: 1000, now: () => 0 });
		cache.set('a', brief);
		expect(cache.get('a')).toEqual(brief);
	});

	it('discards a brief once its time to live has passed', () => {
		let now = 0;
		const cache = new MemoryInlineBriefCache({ ttlMs: 1000, now: () => now });
		cache.set('a', brief);
		now = 1001;
		expect(cache.get('a')).toBeUndefined();
	});

	it('evicts the least recently used brief past the entry limit', () => {
		const cache = new MemoryInlineBriefCache({ maxEntries: 2, now: () => 0 });
		cache.set('a', brief);
		cache.set('b', brief);
		cache.get('a');
		cache.set('c', brief);
		expect(cache.get('b')).toBeUndefined();
	});

	it('returns nothing for a key that was never stored', () => {
		expect(new MemoryInlineBriefCache().get('missing')).toBeUndefined();
	});

	it('coalesces concurrent loads for the same section', async () => {
		const cache = new MemoryInlineBriefCache();
		let calls = 0;
		const load = async () => {
			calls++;
			return brief;
		};
		await Promise.all([cache.getOrLoad('a', load), cache.getOrLoad('a', load)]);
		expect(calls).toBe(1);
	});
});

describe('inlineBriefKey', () => {
	it('is stable for the same user, note, and section', () => {
		expect(inlineBriefKey(key)).toBe(inlineBriefKey({ ...key }));
	});

	it('reuses one brief across revisions of the same section', () => {
		// Autosave advances the revision as the user types; the brief must survive it.
		expect(inlineBriefKey({ ...key })).toBe(inlineBriefKey({ ...key }));
	});

	it('separates two users at the same caret', () => {
		expect(inlineBriefKey({ ...key, userId: 'user-2' })).not.toBe(inlineBriefKey(key));
	});

	it('separates two notes at the same caret', () => {
		expect(inlineBriefKey({ ...key, noteId: 'note-2' })).not.toBe(inlineBriefKey(key));
	});

	it('separates two sections of the same note', () => {
		expect(inlineBriefKey({ ...key, heading: 'Rollback' })).not.toBe(inlineBriefKey(key));
	});
});

describe('MemoryInlineSuggestionThrottle', () => {
	it('admits a first request', () => {
		expect(new MemoryInlineSuggestionThrottle().admit('user-1')).toBe(true);
	});

	it('refuses a second concurrent request for the same user', () => {
		const throttle = new MemoryInlineSuggestionThrottle();
		throttle.admit('user-1');
		expect(throttle.admit('user-1')).toBe(false);
	});

	it('admits another user while one is in flight', () => {
		const throttle = new MemoryInlineSuggestionThrottle();
		throttle.admit('user-1');
		expect(throttle.admit('user-2')).toBe(true);
	});

	it('admits again once the previous request is released', () => {
		const throttle = new MemoryInlineSuggestionThrottle();
		throttle.admit('user-1');
		throttle.release('user-1');
		expect(throttle.admit('user-1')).toBe(true);
	});

	it('refuses a request past the per-minute budget', () => {
		const throttle = new MemoryInlineSuggestionThrottle({ requestsPerMinute: 2, now: () => 0 });
		throttle.admit('user-1');
		throttle.release('user-1');
		throttle.admit('user-1');
		throttle.release('user-1');
		expect(throttle.admit('user-1')).toBe(false);
	});

	it('admits again once the budget window has rolled over', () => {
		let now = 0;
		const throttle = new MemoryInlineSuggestionThrottle({ requestsPerMinute: 1, now: () => now });
		throttle.admit('user-1');
		throttle.release('user-1');
		now = 60_001;
		expect(throttle.admit('user-1')).toBe(true);
	});
});
