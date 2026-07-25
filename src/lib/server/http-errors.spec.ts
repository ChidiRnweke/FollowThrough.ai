import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError, type DomainErrorCode } from '$lib/models';
import { DOMAIN_ERROR_STATUS, describeError, domainErrorStatus } from './http-errors';

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
