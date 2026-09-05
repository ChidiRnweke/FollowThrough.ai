// Drizzle wraps every driver failure in a `DrizzleQueryError` whose own message is
// only `Failed query: …`, so the Postgres error code lives on the `cause` chain.
// Inspecting `error.message` alone silently misses every constraint violation.

const UNIQUE_VIOLATION = '23505';

// Every read below is `in` narrowing rather than a cast: on an `object` it
// resolves the field to `unknown`, and the `typeof` test does the rest, all of
// it checked by the compiler. A zod schema was the other candidate and is the
// wrong tool here — every field on a driver error is optional and independently
// readable, so a schema over the whole link would have to decide what a link
// with one unreadable field means, and would drop the readable rest with it.
const causes = (error: unknown): readonly object[] => {
	const chain: object[] = [];
	let current = error;
	// Bounded, and `seen` guards against a self-referential cause.
	const seen = new Set<object>();
	while (typeof current === 'object' && current !== null && !seen.has(current)) {
		seen.add(current);
		chain.push(current);
		current = 'cause' in current ? current.cause : undefined;
	}
	return chain;
};

const matchesConstraint = (link: object, constraint: string | undefined): boolean => {
	if (!constraint) return true;
	const name = 'constraint_name' in link ? link.constraint_name : undefined;
	// postgres.js only reports `constraint_name` for some violations; when it is
	// absent the code alone is the best signal we have.
	return typeof name !== 'string' || name === constraint;
};

/**
 * Whether `error` (or anything on its `cause` chain) is a Postgres unique
 * violation, optionally narrowed to one constraint by name.
 */
export const isUniqueViolation = (error: unknown, constraint?: string): boolean =>
	causes(error).some((link) => {
		const code = 'code' in link ? link.code : undefined;
		if (code === UNIQUE_VIOLATION) return matchesConstraint(link, constraint);
		if (typeof code === 'string') return false;
		// `message` is a non-enumerable own property of an `Error`, which `in`
		// still finds — the driver's message is the only signal left when it
		// reported no code at all.
		const message = 'message' in link ? link.message : undefined;
		return (
			typeof message === 'string' &&
			/duplicate key|unique constraint/i.test(message) &&
			matchesConstraint(link, constraint)
		);
	});
