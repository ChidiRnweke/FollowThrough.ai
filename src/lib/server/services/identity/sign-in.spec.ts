import { describe, expect, it } from 'vitest';
import { SignIn } from './sign-in';

describe('SignIn', () => {
	it('is available as a domain service', () => {
		expect(SignIn).toBeTypeOf('function');
	});
});
