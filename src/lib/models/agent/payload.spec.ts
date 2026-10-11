import { describe, expect, it } from 'vitest';
import { agentPayloadResultSchema, agentPayloadObjectResultSchema } from './payload';

describe('Reading a tool payload off the wire', () => {
	it('keeps a nested object and array whole', () => {
		expect(agentPayloadResultSchema.parse({ notes: [{ title: 'Rollout' }], count: 1 })).toEqual({
			kind: 'valid',
			value: { notes: [{ title: 'Rollout' }], count: 1 }
		});
	});

	it('accepts null as a value rather than as an absence', () => {
		expect(agentPayloadResultSchema.parse({ parentId: null })).toEqual({
			kind: 'valid',
			value: { parentId: null }
		});
	});

	it('reads a property holding undefined as the absence JSON.stringify makes of it', () => {
		expect(
			agentPayloadResultSchema.parse({ suggestion: { id: 'sug_1', noteId: undefined } })
		).toEqual({
			kind: 'valid',
			value: { suggestion: { id: 'sug_1' } }
		});
	});

	it('reports the path of a value JSON cannot carry', () => {
		const read = agentPayloadResultSchema.parse({ note: { revision: Number.NaN } });
		expect(read.kind === 'corrupt' && read.message).toContain('root.note.revision');
	});

	it('refuses an object that only looks like one', () => {
		expect(agentPayloadResultSchema.parse({ writtenAt: new Date() }).kind).toBe('corrupt');
	});

	it('refuses a value that has no JSON spelling at all', () => {
		expect(agentPayloadResultSchema.parse({ retry: () => undefined }).kind).toBe('corrupt');
	});

	it('names the offending element of an array', () => {
		const read = agentPayloadResultSchema.parse(['ok', undefined]);
		expect(read.kind === 'corrupt' && read.message).toBe('root[1] is undefined');
	});
});

describe('Reading a payload that has to be an object', () => {
	it('answers with the object when it is one', () => {
		expect(agentPayloadObjectResultSchema.parse({ query: 'skills' })).toEqual({
			kind: 'valid',
			value: { query: 'skills' }
		});
	});

	it('refuses an array, which carries no arguments', () => {
		expect(agentPayloadObjectResultSchema.parse([{ query: 'skills' }]).kind).toBe('corrupt');
	});
});

it('preserves own prototype-like keys in nested authored JSON', () => {
	const value = JSON.parse(
		'{"nested":{"__proto__":{"x":1},"constructor":"own","toString":"text"}}'
	);
	expect(agentPayloadResultSchema.parse(value)).toEqual({ kind: 'valid', value });
});
