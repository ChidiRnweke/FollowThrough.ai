/**
 * Per-note store registry.
 *
 * Many Svelte 5 stores in this codebase were originally singletons keyed
 * implicitly by "whatever note the user happens to have open".  The workbench
 * shell supports multiple open tabs and (eventually) a split pane, so each
 * open note needs its own store instance.
 *
 * A `Registry` hands out instances by key, keeps them alive while at least one
 * pane is observing them, and destroys them once no pane remains.  The
 * persistent IndexedDB layer that backs several of these stores is already
 * keyed per note, so destroying an in-memory store on tab close is cheap to
 * rehydrate on the next open.
 */
export class Registry<K, V> {
	private instances = new Map<K, V>();
	private refcounts = new Map<K, number>();

	constructor(
		private readonly factory: (key: K) => V,
		private readonly onDestroy?: (key: K, value: V) => void
	) {}

	/**
	 * Returns the store for `key`, creating it on first use and bumping its
	 * reference count.  Every call to `for` must be balanced by `release` when
	 * the caller (e.g. a pane) unmounts.
	 */
	for(key: K): V {
		const existing = this.instances.get(key);
		if (existing) {
			this.refcounts.set(key, (this.refcounts.get(key) ?? 0) + 1);
			return existing;
		}
		const created = this.factory(key);
		this.instances.set(key, created);
		this.refcounts.set(key, 1);
		return created;
	}

	/**
	 * Drops a reference.  When the last reference is released the instance is
	 * destroyed and `onDestroy` (if any) is invoked, freeing the in-memory
	 * store.  Persistent state (e.g. IndexedDB records) is left untouched;
	 * re-opening the note reconstructs a fresh store from that state.
	 */
	release(key: K): void {
		const count = this.refcounts.get(key);
		if (count === undefined) return;
		const next = count - 1;
		if (next > 0) {
			this.refcounts.set(key, next);
			return;
		}
		this.refcounts.delete(key);
		const instance = this.instances.get(key);
		this.instances.delete(key);
		if (instance && this.onDestroy) this.onDestroy(key, instance);
	}

	/** Test/debug hook: an instance is currently referenced by at least one pane. */
	isHeld(key: K): boolean {
		return (this.refcounts.get(key) ?? 0) > 0;
	}

	/** Test/debug hook: an instance is currently cached (held by at least one pane). */
	has(key: K): boolean {
		return this.instances.has(key);
	}

	/** Test/debug hook: number of currently-held references for a key. */
	refcount(key: K): number {
		return this.refcounts.get(key) ?? 0;
	}

	/**
	 * Returns the held store for `key` without acquiring a reference.  Use
	 * this for read-only consumers (e.g. the right panel reading the focused
	 * pane's selection / suggestions).  Returns `undefined` when no pane
	 * currently holds the key, so callers can fall back gracefully.
	 *
	 * Unlike `for`, this does not bump the refcount and does not resurrect a
	 * destroyed instance.
	 */
	peek(key: K): V | undefined {
		return this.instances.get(key);
	}

	/**
	 * Iterates every key currently referenced by at least one pane.  Used by
	 * cross-pane updaters (e.g. todo mutations) that need to fan an update out
	 * to whichever open note holds the matching record.
	 */
	*heldKeys(): IterableIterator<K> {
		for (const key of this.refcounts.keys()) yield key;
	}
}
