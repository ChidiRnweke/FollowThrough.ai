import { untrack } from 'svelte';

/**
 * Counts the times a value goes up after mount. Motion keys off the count, so it answers a change
 * the user watched happen — never a page load, which mounts everything in its final state at once.
 * `undefined` means the value is not known yet, and its first arrival is not a rise: data that
 * finishes loading is not something the user did. Keying a block on `count` remounts it on every
 * rise, which restarts its CSS animation.
 */
export class Increases {
	count = $state(0);

	constructor(read: () => number | undefined) {
		let last = untrack(read);
		// `pre`, so the count is current in the same render as the change: a block that mounts
		// with the change mounts already marked, and never shows a frame of its resting state.
		$effect.pre(() => {
			const next = read();
			if (next !== undefined && last !== undefined && next > last) untrack(() => (this.count += 1));
			last = next;
		});
	}
}
