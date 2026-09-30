import type { WriteRebase } from '$lib/models/outbox';

/** Key order and absent-versus-undefined fields do not distinguish stored JSON values. */
const canonical = <V>(value: V): string =>
	JSON.stringify(value, (_key, field) =>
		field && typeof field === 'object' && !Array.isArray(field)
			? Object.fromEntries(Object.entries(field).sort(([left], [right]) => (left < right ? -1 : 1)))
			: field
	) ?? 'undefined';

export const sameValue = <V>(left: V, right: V): boolean =>
	left === right || canonical(left) === canonical(right);

/** A value without fields is one field: a changed value either stands alone or collides. */
export const wholeValueRebase =
	<T extends string | number | boolean>(): WriteRebase<T> =>
	(observed, local, onto) =>
		sameValue(local, observed)
			? { value: onto, overlaps: false }
			: { value: local, overlaps: !sameValue(onto, observed) && !sameValue(onto, local) };

/**
 * Three-way field replay. Every field the local edit changed keeps its local value; every other
 * field takes the newer version. `bookkeeping` fields (timestamps and counters the server
 * reassigns on every write) follow the same replay but never count as an overlap.
 */
export const rebaseFields = <V extends object>(
	observed: V,
	local: V,
	onto: V,
	bookkeeping: ReadonlySet<string>
): { value: V; overlaps: boolean } => {
	const value = { ...onto };
	let overlaps = false;
	// Keys come from three values of one resource type; optional fields may be absent from some.
	const keys = [
		...new Set([observed, local, onto].flatMap((side) => Object.keys(side)))
	] as (keyof V)[];
	for (const key of keys) {
		if (sameValue(local[key], observed[key])) continue;
		value[key] = local[key];
		if (
			!bookkeeping.has(String(key)) &&
			!sameValue(onto[key], observed[key]) &&
			!sameValue(onto[key], local[key])
		)
			overlaps = true;
	}
	return { value, overlaps };
};
