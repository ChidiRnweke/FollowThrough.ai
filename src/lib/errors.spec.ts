import { describe, expect, it } from 'vitest';
import {
	ConflictError,
	describeError,
	ExternalServiceError,
	NotFoundError,
	userFacingMessage,
	ValidationError
} from '$lib/errors';
import type { DomainErrorCode } from '$lib/errors';
import {
	DOMAIN_ERROR_ADVICE,
	DOMAIN_ERROR_STATUS,
	domainErrorStatus,
	failureReport
} from './errors';

const ALL_CODES: readonly DomainErrorCode[] = [
	'VALIDATION',
	'NOT_FOUND',
	'OWNERSHIP',
	'CONFLICT',
	'STALE_REVISION',
	'INVALID_TRANSITION',
	'EXPIRED_SUGGESTION',
	'UNSUPPORTED_DIAGRAM_OPERATION',
	'EXTERNAL_SERVICE',
	'INVALID_GENERATED_CONTENT'
];

describe('domainErrorStatus', () => {
	it('maps a not-found failure to 404', () => {
		expect(domainErrorStatus(new NotFoundError('Project was not found'))).toBe(404);
	});

	it('maps a conflict to 409', () => {
		expect(domainErrorStatus(new ConflictError('Name already exists'))).toBe(409);
	});

	it('maps a validation failure to 400', () => {
		expect(domainErrorStatus(new ValidationError('Name is required'))).toBe(400);
	});

	it('returns undefined for a non-domain error', () => {
		expect(domainErrorStatus(new Error('boom'))).toBeUndefined();
	});

	it('assigns a client or server status to every domain code', () => {
		expect(ALL_CODES.filter((code) => !(DOMAIN_ERROR_STATUS[code] >= 400))).toEqual([]);
	});
});

describe('DomainError', () => {
	it('forwards a captured cause to the native cause chain', () => {
		expect(
			new ExternalServiceError('Document could not be stored', { cause: 'NoSuchBucket' }).cause
		).toBe('NoSuchBucket');
	});

	it('keeps the captured cause available under details', () => {
		expect(
			new ExternalServiceError('Document could not be stored', { cause: 'NoSuchBucket' }).details
		).toEqual({ cause: 'NoSuchBucket' });
	});

	it('leaves cause undefined when the throw site captured none', () => {
		expect(new NotFoundError('Project was not found').cause).toBeUndefined();
	});

	it('describes the underlying reason once the cause is forwarded', () => {
		expect(
			describeError(
				new ExternalServiceError('Document could not be stored', { cause: 'NoSuchBucket' })
			)
		).toBe('ExternalServiceError: Document could not be stored (EXTERNAL_SERVICE) <- NoSuchBucket');
	});
});

describe('describeError', () => {
	it('includes the driver detail hidden on the cause chain', () => {
		const cause = Object.assign(new Error('duplicate key value'), { code: '23505' });
		const wrapped = Object.assign(new Error('Failed query: insert …'), { cause });
		expect(describeError(wrapped)).toBe(
			'Error: Failed query: insert … <- Error: duplicate key value (23505)'
		);
	});

	it('describes a plain value', () => {
		expect(describeError('nope')).toBe('nope');
	});
});

describe('userFacingMessage', () => {
	it("uses a remote function's domain message, which is not an Error", () => {
		expect(
			userFacingMessage({ message: 'Diagram is malformed', code: 'VALIDATION' }, 'fallback')
		).toBe('Diagram is malformed');
	});

	it('uses the fallback when the failure says nothing', () => {
		expect(userFacingMessage({}, 'fallback')).toBe('fallback');
	});

	it("uses a thrown Error's message", () => {
		expect(userFacingMessage(new Error('boom'), 'fallback')).toBe('boom');
	});
});

/**
 * Advice that does not name an action is advice a caller cannot follow, and a constant
 * string is not advice at all. The agent loop is the caller this exists for: it reads the
 * failure, and what it does next is decided by what the failure told it to do.
 */
describe('failureReport', () => {
	it.each(ALL_CODES)('gives %s advice of its own', (code) => {
		expect(DOMAIN_ERROR_ADVICE[code].length).toBeGreaterThan(0);
	});

	it('gives each code distinct advice', () => {
		expect(new Set(ALL_CODES.map((code) => DOMAIN_ERROR_ADVICE[code])).size).toBe(ALL_CODES.length);
	});

	it("keeps a domain failure's own message, which is written for the caller", () => {
		expect(failureReport(new NotFoundError('No note has that id')).message).toBe(
			'No note has that id'
		);
	});

	it('advises a search after a missing record rather than a retry', () => {
		expect(failureReport(new NotFoundError('gone')).advice).toContain('Search for it');
	});

	it('advises a re-read after a conflict rather than a retry', () => {
		expect(failureReport(new ConflictError('changed')).advice).toContain('read');
	});

	/**
	 * The production incident in one assertion. A `ZodError` raised inside note
	 * preparation was handed to the model as though its arguments were wrong. They were
	 * not, so it corrected them, six times, and every correction failed identically.
	 */
	it('tells a caller that an internal fault is not its arguments', () => {
		expect(failureReport(new TypeError('content[12] is not writable')).advice).toContain(
			'Do not retry this call'
		);
	});

	it('does not repeat an internal error message to the caller', () => {
		expect(failureReport(new TypeError('content[12] is not writable')).message).not.toContain(
			'content[12]'
		);
	});

	it('treats a thrown non-Error as an internal fault too', () => {
		expect(failureReport('something odd').advice).toContain('Do not retry this call');
	});
});
