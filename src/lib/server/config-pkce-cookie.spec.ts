import { expect, it } from 'vitest';
import { deletePkceCookie, getPkceCookie, setPkceCookie } from './config';

const cookieStore = () => {
	const values = new Map<string, string>();
	const set: Parameters<typeof setPkceCookie>[0]['set'] = (name, value) => {
		values.set(name, value);
	};
	const remove: Parameters<typeof deletePkceCookie>[0]['delete'] = (name) => {
		values.delete(name);
	};
	return { values, cookies: { get: (name: string) => values.get(name), set, delete: remove } };
};
it('keeps simultaneous sign-in verifiers associated with their own state', () => {
	const { cookies } = cookieStore();
	setPkceCookie(cookies, 'first-state', 'first-verifier', true);
	setPkceCookie(cookies, 'second-state', 'second-verifier', true);
	expect([getPkceCookie(cookies, 'first-state'), getPkceCookie(cookies, 'second-state')]).toEqual([
		{ state: 'first-state', codeVerifier: 'first-verifier' },
		{ state: 'second-state', codeVerifier: 'second-verifier' }
	]);
});
it('does not supply another sign-in verifier for an unknown state', () => {
	const { cookies } = cookieStore();
	setPkceCookie(cookies, 'first-state', 'first-verifier', true);
	expect(getPkceCookie(cookies, 'unknown-state')).toBeNull();
});
it('consumes only the completed sign-in state', () => {
	const { cookies } = cookieStore();
	setPkceCookie(cookies, 'first-state', 'first-verifier', true);
	setPkceCookie(cookies, 'second-state', 'second-verifier', true);
	deletePkceCookie(cookies, 'first-state');
	expect([getPkceCookie(cookies, 'first-state'), getPkceCookie(cookies, 'second-state')]).toEqual([
		null,
		{ state: 'second-state', codeVerifier: 'second-verifier' }
	]);
});
it.each(['{', '{}', '{"state":"state","codeVerifier":""}', '{"state":"state","codeVerifier":17}'])(
	'rejects a malformed verification cookie: %s',
	(value) => {
		const { cookies, values } = cookieStore();
		values.set('oauth_state', value);
		expect(() => getPkceCookie(cookies, 'state')).toThrow(
			'The OAuth verification cookie is corrupt'
		);
	}
);
it('keeps the verifier private and short-lived on HTTPS', () => {
	const options: Parameters<Parameters<typeof setPkceCookie>[0]['set']>[2][] = [];
	const set: Parameters<typeof setPkceCookie>[0]['set'] = (_name, _value, value) => {
		options.push(value);
	};
	setPkceCookie({ set }, 'state', 'verifier', true);
	expect(options).toEqual([
		{ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 }
	]);
});
