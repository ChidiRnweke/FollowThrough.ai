// Drizzle wraps every driver failure in a `DrizzleQueryError` whose own message is
// only `Failed query: …`, so the Postgres error code lives on the `cause` chain.
// Inspecting `error.message` alone silently misses every constraint violation.

const UNIQUE_VIOLATION = '23505';

const causes = (error: unknown): readonly object[] => {
	const chain: object[] = [];
	let current = error;
	// Bounded, and `seen` guards against a self-referential cause.
	const seen = new Set<object>();
	while (typeof current === 'object' && current !== null && !seen.has(current)) {
		seen.add(current);
		chain.push(current);
		current = (current as { cause?: unknown }).cause;
	}
	return chain;
};

const matchesConstraint = (link: object, constraint: string | undefined): boolean => {
	if (!constraint) return true;
	const name = (link as { constraint_name?: unknown }).constraint_name;
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
		const code = (link as { code?: unknown }).code;
		if (code === UNIQUE_VIOLATION) return matchesConstraint(link, constraint);
		if (typeof code === 'string') return false;
		const message = (link as { message?: unknown }).message;
		return (
			typeof message === 'string' &&
			/duplicate key|unique constraint/i.test(message) &&
			matchesConstraint(link, constraint)
		);
	});
