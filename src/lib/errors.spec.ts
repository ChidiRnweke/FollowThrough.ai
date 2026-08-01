import { describe, expect, it } from 'vitest';
import {
	ConflictError,
	describeError,
	ExternalServiceError,
	NotFoundError,
	ValidationError
} from '$lib/errors';
import type { DomainErrorCode } from '$lib/errors';
import { DOMAIN_ERROR_STATUS, domainErrorStatus } from './errors';

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
