import { describe, expect, it } from 'vitest';
import { compileJsonSchema, type SchemaCompilation } from './compile';

const compiled = (compilation: SchemaCompilation) => {
	if (compilation.kind !== 'compiled')
		throw new Error(`Expected a compiled schema: ${compilation.reason}`);
	return compilation.check;
};

describe('compileJsonSchema', () => {
	it('validates arguments against a 2020-12 schema with formats and $defs', () => {
		const check = compiled(
			compileJsonSchema({
				type: 'object',
				properties: {
					title: { type: 'string' },
					due: { type: 'string', format: 'date' },
					assignee: { $ref: '#/$defs/user' }
				},
				required: ['title'],
				$defs: {
					user: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
				}
			})
		);
		expect({
			valid: check({ title: 'Ship it', due: '2026-11-20', assignee: { id: 'u1' } }),
			invalid: check({ due: 'next week', assignee: {} })
		}).toEqual({
			valid: { kind: 'valid' },
			invalid: {
				kind: 'invalid',
				problems: [
					"arguments must have required property 'title'",
					'arguments/due must match format "date"',
					"arguments/assignee must have required property 'id'"
				]
			}
		});
	});

	it('keeps each pattern of a schema distinct', () => {
		const check = compiled(
			compileJsonSchema({
				type: 'object',
				properties: {
					key: { type: 'string', pattern: '^[A-Z]+-[0-9]+$' },
					color: { type: 'string', pattern: '^#[0-9a-f]{6}$' }
				}
			})
		);
		expect({
			both: check({ key: 'ENG-12', color: '#a1b2c3' }),
			swapped: check({ key: '#a1b2c3', color: 'ENG-12' }).kind
		}).toEqual({ both: { kind: 'valid' }, swapped: 'invalid' });
	});

	it('accepts a draft-07 schema and rejects a dialect it cannot honour', () => {
		expect({
			draft07: compileJsonSchema({
				$schema: 'http://json-schema.org/draft-07/schema#',
				type: 'object',
				properties: { q: { type: 'string' } }
			}).kind,
			draft04: compileJsonSchema({
				$schema: 'http://json-schema.org/draft-04/schema#',
				type: 'object'
			})
		}).toEqual({
			draft07: 'compiled',
			draft04: {
				kind: 'failure',
				reason: 'The schema dialect http://json-schema.org/draft-04/schema# is not supported.'
			}
		});
	});

	it('rejects a schema that is not valid JSON Schema', () => {
		expect(compileJsonSchema({ type: 'object', properties: { q: { type: 'strng' } } }).kind).toBe(
			'failure'
		);
	});
});
