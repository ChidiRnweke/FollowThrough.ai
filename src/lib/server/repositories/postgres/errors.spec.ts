import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './errors';

// Mirrors drizzle's `DrizzleQueryError`: its own message says nothing useful, and
// the driver error hangs off `cause`.
const wrapped = (cause: unknown): Error =>
	Object.assign(new Error('Failed query: insert into "projects" …\nparams: …'), { cause });

const pgError = (patch: Record<string, unknown> = {}): Error =>
	Object.assign(new Error('duplicate key value violates unique constraint'), {
		code: '23505',
		constraint_name: 'projects_user_name_unique',
		...patch
	});

describe('isUniqueViolation', () => {
	it('detects a unique violation carried on the cause chain', () => {
		expect(isUniqueViolation(wrapped(pgError()))).toBe(true);
	});

	it('detects a unique violation on the error itself', () => {
		expect(isUniqueViolation(pgError())).toBe(true);
	});

	it('matches when the named constraint is the violated one', () => {
		expect(isUniqueViolation(wrapped(pgError()), 'projects_user_name_unique')).toBe(true);
	});

	it('does not match a different constraint', () => {
		expect(isUniqueViolation(wrapped(pgError()), 'notes_user_title_unique')).toBe(false);
	});

	it('matches by message when the driver reports no code', () => {
		expect(isUniqueViolation(wrapped(new Error('duplicate key value violates …')))).toBe(true);
	});

	it('ignores a foreign-key violation', () => {
		const cause = pgError({
			code: '23503',
			message: 'insert or update on table "projects" violates foreign key constraint'
		});
		expect(isUniqueViolation(wrapped(cause))).toBe(false);
	});

	it('ignores an unrelated failure', () => {
		expect(isUniqueViolation(wrapped(new Error('connection terminated')))).toBe(false);
	});

	it('ignores a non-error value', () => {
		expect(isUniqueViolation('duplicate key')).toBe(false);
	});

	it('terminates on a self-referential cause chain', () => {
		const error: Error & { cause?: unknown } = new Error('loop');
		error.cause = error;
		expect(isUniqueViolation(error)).toBe(false);
	});
});
