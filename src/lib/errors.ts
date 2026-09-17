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

type NoDomainErrorDetails = { readonly cause?: never };

export type NotFoundErrorDetails =
	| NoDomainErrorDetails
	| { readonly noteId: string; readonly revisionId?: string }
	| { readonly projectId: string }
	| { readonly suggestionId: string }
	| { readonly todoId: string }
	| { readonly memoryEntryId: string }
	| { readonly diagramId: string };

export interface DomainErrorDetailsByCode {
	readonly VALIDATION: NoDomainErrorDetails;
	readonly NOT_FOUND: NotFoundErrorDetails;
	readonly OWNERSHIP: NoDomainErrorDetails;
	readonly CONFLICT: NoDomainErrorDetails;
	readonly STALE_REVISION: NoDomainErrorDetails;
	readonly INVALID_TRANSITION: NoDomainErrorDetails;
	readonly EXPIRED_SUGGESTION: NoDomainErrorDetails;
	readonly UNSUPPORTED_DIAGRAM_OPERATION: NoDomainErrorDetails;
	readonly EXTERNAL_SERVICE: NoDomainErrorDetails | { readonly cause: string };
	readonly INVALID_GENERATED_CONTENT: NoDomainErrorDetails;
}

export class DomainError extends Error {
	constructor(
		readonly code: DomainErrorCode,
		message: string,
		readonly details: DomainErrorDetailsByCode[DomainErrorCode]
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
	constructor(message: string, details: DomainErrorDetailsByCode['VALIDATION'] = {}) {
		super('VALIDATION', message, details);
	}
}
export class NotFoundError extends DomainError {
	constructor(message: string, details: DomainErrorDetailsByCode['NOT_FOUND'] = {}) {
		super('NOT_FOUND', message, details);
	}
}
export class OwnershipError extends DomainError {
	constructor(message: string, details: DomainErrorDetailsByCode['OWNERSHIP'] = {}) {
		super('OWNERSHIP', message, details);
	}
}
export class ConflictError extends DomainError {
	constructor(message: string, details: DomainErrorDetailsByCode['CONFLICT'] = {}) {
		super('CONFLICT', message, details);
	}
}
export class StaleRevisionError extends DomainError {
	constructor(message: string, details: DomainErrorDetailsByCode['STALE_REVISION'] = {}) {
		super('STALE_REVISION', message, details);
	}
}
export class InvalidTransitionError extends DomainError {
	constructor(message: string, details: DomainErrorDetailsByCode['INVALID_TRANSITION'] = {}) {
		super('INVALID_TRANSITION', message, details);
	}
}
export class ExpiredSuggestionError extends DomainError {
	constructor(message: string, details: DomainErrorDetailsByCode['EXPIRED_SUGGESTION'] = {}) {
		super('EXPIRED_SUGGESTION', message, details);
	}
}
export class UnsupportedDiagramOperationError extends DomainError {
	constructor(
		message: string,
		details: DomainErrorDetailsByCode['UNSUPPORTED_DIAGRAM_OPERATION'] = {}
	) {
		super('UNSUPPORTED_DIAGRAM_OPERATION', message, details);
	}
}
export class ExternalServiceError extends DomainError {
	constructor(message: string, details: DomainErrorDetailsByCode['EXTERNAL_SERVICE'] = {}) {
		super('EXTERNAL_SERVICE', message, details);
	}
}
export class InvalidGeneratedContentError extends DomainError {
	constructor(
		message: string,
		details: DomainErrorDetailsByCode['INVALID_GENERATED_CONTENT'] = {}
	) {
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

/**
 * What a caller that can act on a failure should do next (ADR 0035).
 *
 * Total over the code union for the same reason {@link DOMAIN_ERROR_STATUS} is: a new
 * failure code is a type error until someone has decided what a caller does about it.
 * Each entry names an action, because advice that does not is advice the caller cannot
 * follow.
 */
export const DOMAIN_ERROR_ADVICE: Record<DomainErrorCode, string> = {
	VALIDATION: 'Read the failure, correct the arguments it names, and call the tool again.',
	OWNERSHIP:
		'This belongs to someone else. Do not retry it. Tell the user what you could not reach.',
	NOT_FOUND:
		'Nothing exists with that identifier. Search for it and call the tool again with an identifier the search returned.',
	CONFLICT:
		'Something else changed this first. Read it with a read tool, then base a new call on what you read.',
	STALE_REVISION:
		'This changed after you read it. Read it again and submit a new call against its current revision.',
	INVALID_TRANSITION:
		'The change is not legal from the current state. Read the current state and choose a change that is.',
	EXPIRED_SUGGESTION: 'The suggestion no longer exists. Produce a new one before you act on it.',
	UNSUPPORTED_DIAGRAM_OPERATION:
		'This diagram does not support that operation. Read the diagram and choose an operation it supports.',
	EXTERNAL_SERVICE:
		'An upstream service failed, not your call. Retrying it once may work. Tell the user if it keeps failing.',
	INVALID_GENERATED_CONTENT:
		'The generated content did not meet its contract. Generate it again, more simply.'
};

/**
 * A fault that is ours, not the caller's.
 *
 * Anything that is not a {@link DomainError} reached the boundary unplanned, so its
 * message describes our internals and not the caller's request. A model handed one of
 * those cannot act on it: a `ZodError` naming `content[12]` of a document it never
 * authored reads as an argument it should fix, and it will try, and it will fail the same
 * way. Production showed exactly that, six times in five minutes. So the caller is told
 * the truth instead, and the detail goes to the operator through boundary logging.
 */
const INTERNAL_FAULT: FailureReport = {
	message:
		'The application failed while handling this call. The fault is ours, not your arguments.',
	advice:
		'Do not retry this call. Changing the arguments will not change the result. Tell the user what you were trying to do, then continue with the rest of the task or stop.'
};

/** What the caller is told a failure was, and what it should do about it. */
export interface FailureReport {
	readonly message: string;
	readonly advice: string;
}

/**
 * Render a failure for a caller that decides what happens next.
 *
 * Advice comes from the failure, never from a constant: ADR 0035 requires that it be
 * based on resolved state, and the difference between "fix your arguments" and "this is
 * not something your arguments can fix" is the difference between a caller that recovers
 * and one that loops.
 */
export const failureReport = (error: unknown): FailureReport =>
	error instanceof DomainError
		? { message: error.message, advice: DOMAIN_ERROR_ADVICE[error.code] }
		: INTERNAL_FAULT;

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
			const code = 'code' in current ? current.code : undefined;
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

/**
 * The message to show a user for a failure that came back from the server.
 *
 * A remote function does not reject with an `Error`: SvelteKit sends the object
 * `handleError` returned and the client rejects with that shape, so the usual
 * `error instanceof Error ? error.message : fallback` idiom throws away the one
 * useful thing — a `DomainError`'s own message — and shows the generic fallback
 * instead. That is how "The diagram could not be saved" hid a precise validation
 * error for as long as it did.
 */
export function userFacingMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === 'object' && error !== null && 'message' in error) {
		const { message } = error;
		if (typeof message === 'string' && message.trim()) return message;
	}
	return fallback;
}
