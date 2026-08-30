import { describe, expect, it } from 'vitest';
import {
	agentPayloadItems,
	isAgentPayloadObject,
	readAgentPayload,
	readAgentPayloadObject
} from './payload';

describe('Reading a tool payload off the wire', () => {
	it('keeps a nested object and array whole', () => {
		expect(readAgentPayload({ notes: [{ title: 'Rollout' }], count: 1 })).toEqual({
			kind: 'valid',
			value: { notes: [{ title: 'Rollout' }], count: 1 }
		});
	});

	it('accepts null as a value rather than as an absence', () => {
		expect(readAgentPayload({ parentId: null })).toEqual({
			kind: 'valid',
			value: { parentId: null }
		});
	});

	it('reports the path of a value JSON cannot carry', () => {
		const read = readAgentPayload({ note: { revision: Number.NaN } });
		expect(read.kind === 'corrupt' && read.message).toContain('root.note.revision');
	});

	it('refuses an object that only looks like one', () => {
		expect(readAgentPayload({ writtenAt: new Date() }).kind).toBe('corrupt');
	});

	it('refuses a value that has no JSON spelling at all', () => {
		expect(readAgentPayload({ retry: () => undefined }).kind).toBe('corrupt');
	});

	it('names the offending element of an array', () => {
		const read = readAgentPayload(['ok', undefined]);
		expect(read.kind === 'corrupt' && read.message).toContain('root[1]');
	});
});

describe('Reading a payload that has to be an object', () => {
	it('answers with the object when it is one', () => {
		expect(readAgentPayloadObject({ query: 'skills' })).toEqual({
			kind: 'valid',
			value: { query: 'skills' }
		});
	});

	it('refuses an array, which carries no arguments', () => {
		expect(readAgentPayloadObject([{ query: 'skills' }]).kind).toBe('corrupt');
	});
});

describe('Picking an arm of the payload union', () => {
	it('does not mistake an array for an object', () => {
		expect(isAgentPayloadObject([])).toBe(false);
	});

	it('does not mistake null for an object', () => {
		expect(isAgentPayloadObject(null)).toBe(false);
	});

	it('answers with the elements of an array', () => {
		expect(agentPayloadItems(['a', 'b'])).toEqual(['a', 'b']);
	});

	it('answers with nothing for a value that is not an array', () => {
		expect(agentPayloadItems({ 0: 'a' })).toBeUndefined();
	});
});
