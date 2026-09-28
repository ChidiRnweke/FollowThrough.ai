/**
 * The letters on the account avatar: the first letter of the first and last
 * words of a display name, so "Ada Lovelace" reads "AL" and a single name reads
 * as its one initial.
 */
export function initialsOf(displayName: string): string {
	const words = displayName.trim().split(/\s+/).filter(Boolean);
	const first = words.at(0);
	if (!first) return '';
	const last = words.length > 1 ? words.at(-1) : undefined;
	return [first, last]
		.filter((word) => word !== undefined)
		.map((word) => Array.from(word)[0].toLocaleUpperCase())
		.join('');
}
