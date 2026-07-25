import { DomainError, type DomainErrorCode } from '$lib/models';

/** HTTP status for each domain failure, so callers see a meaningful code, not a 500. */
export const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number> = {
	VALIDATION: 400,
	OWNERSHIP: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	STALE_REVISION: 409,
	INVALID_TRANSITION: 409,
	EXPIRED_SUGGESTION: 410,
	UNSUPPORTED_DIAGRAM_OPERATION: 422,
	INVALID_GENERATED_CONTENT: 422,
	EXTERNAL_SERVICE: 502
};

export const domainErrorStatus = (error: unknown): number | undefined =>
	error instanceof DomainError ? DOMAIN_ERROR_STATUS[error.code] : undefined;

/**
 * Flattens an error and its `cause` chain into one log line. Drizzle reports only
 * `Failed query: …` on the outer error, so without the chain the actual Postgres
 * detail never reaches the logs.
 */
export const describeError = (error: unknown): string => {
	const parts: string[] = [];
	let current: unknown = error;
	const seen = new Set<object>();
	while (current !== undefined && current !== null) {
		if (typeof current === 'object') {
			if (seen.has(current)) break;
			seen.add(current);
		}
		if (current instanceof Error) {
			const code = (current as { code?: unknown }).code;
			parts.push(`${current.name}: ${current.message}${typeof code === 'string' ? ` (${code})` : ''}`);
			current = current.cause;
		} else {
			parts.push(String(current));
			break;
		}
	}
	return parts.join(' <- ');
};
