import type { WriteRebase } from '$lib/models/outbox';
/** Primitive fixture values have no fields; replay preserves a remote-only change. */
export const wholeValueRebase =
	<T extends string | number | boolean>(): WriteRebase<T> =>
	(observed, local, onto) =>
		local === observed
			? { value: onto, overlaps: false }
			: { value: local, overlaps: onto !== observed && onto !== local };
