import { describe, expect, it } from 'vitest';
import { widgetDataSchema } from '$lib/models/widgets';
import { readJsonText } from './json-text';

describe('reading widget JSON text', () => {
	it('reads valid data', () => {
		expect(readJsonText('{"done": 3}', widgetDataSchema, 'data')).toEqual({
			kind: 'read',
			value: { done: 3 }
		});
	});
	it('names a syntax error at the part it came from', () => {
		const read = readJsonText('{"done": ', widgetDataSchema, 'data');
		expect(read.kind === 'failure' && read.issues[0]?.path).toBe('/data');
	});
	it('refuses data that is not an object', () => {
		expect(readJsonText('[1, 2]', widgetDataSchema, 'data').kind).toBe('failure');
	});
});
