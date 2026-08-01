export type DomainErrorCode =
	| 'VALIDATION'
	| 'NOT_FOUND'
	| 'OWNERSHIP'
	| 'CONFLICT'
	| 'STALE_REVISION'
	| 'INVALID_TRANSITION'
	| 'EXPIRED_SUGGESTION'
	| 'UNSUPPORTED_DIAGRAM_OPERATION'
	| 'EXTERNAL_SERVICE'
	| 'INVALID_GENERATED_CONTENT';

export class DomainError extends Error {
	constructor(
		readonly code: DomainErrorCode,
		message: string,
		readonly details: Readonly<Record<string, unknown>> = {}
	) {
		// Call sites conventionally put the underlying failure under `details.cause`.
		// Forwarding it to the native `cause` is what lets `describeError`, the OTel
		// console bridge and `span.recordException` walk the chain — without this the
		// original reason is captured but never reaches a log line.
		super(message, 'cause' in details ? { cause: details.cause } : undefined);
		this.name = new.target.name;
	}
}

export class ValidationError extends DomainError {
	constructor(message: string, details?: Readonly<Record<string, unknown>>) {
		super('VALIDATION', message, details);
	}
}
export class NotFoundError extends DomainError {
	constructor(message: string, details?: Readonly<Record<string, unknown>>) {
		super('NOT_FOUND', message, details);
	}
}
export class OwnershipError extends DomainError {
	constructor(message: string, details?: Readonly<Record<string, unknown>>) {
		super('OWNERSHIP', message, details);
	}
}
export class ConflictError extends DomainError {
	constructor(message: string, details?: Readonly<Record<string, unknown>>) {
		super('CONFLICT', message, details);
	}
}
export class StaleRevisionError extends DomainError {
	constructor(message: string, details?: Readonly<Record<string, unknown>>) {
		super('STALE_REVISION', message, details);
	}
}
export class InvalidTransitionError extends DomainError {
	constructor(message: string, details?: Readonly<Record<string, unknown>>) {
		super('INVALID_TRANSITION', message, details);
	}
}
export class ExpiredSuggestionError extends DomainError {
	constructor(message: string, details?: Readonly<Record<string, unknown>>) {
		super('EXPIRED_SUGGESTION', message, details);
	}
}
export class UnsupportedDiagramOperationError extends DomainError {
	constructor(message: string, details?: Readonly<Record<string, unknown>>) {
		super('UNSUPPORTED_DIAGRAM_OPERATION', message, details);
	}
}
export class ExternalServiceError extends DomainError {
	constructor(message: string, details?: Readonly<Record<string, unknown>>) {
		super('EXTERNAL_SERVICE', message, details);
	}
}
export class InvalidGeneratedContentError extends DomainError {
	constructor(message: string, details?: Readonly<Record<string, unknown>>) {
		super('INVALID_GENERATED_CONTENT', message, details);
	}
}

/** HTTP status for each domain failure at the transport boundary. */
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

/** Flatten an error and its `cause` chain into one log line. */
export function describeError(error: unknown): string {
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
			parts.push(
				`${current.name}: ${current.message}${typeof code === 'string' ? ` (${code})` : ''}`
			);
			current = current.cause;
		} else {
			parts.push(String(current));
			break;
		}
	}
	return parts.join(' <- ');
}
