import { describe, expect, it } from 'vitest';
import { SessionRegistry } from './sessions';

describe('SessionRegistry', () => {
	it('is available as a domain service', () => {
		expect(SessionRegistry).toBeTypeOf('function');
	});
});
